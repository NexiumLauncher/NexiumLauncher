import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { spawn, type ChildProcess } from 'node:child_process'
import yauzl from 'yauzl'

const userAgent = 'NEXIUM-Launcher/0.1.0 (desktop app)'
const maximumPackBytes = 2 * 1024 * 1024 * 1024
const maximumExtractedBytes = 10 * 1024 * 1024 * 1024
const maximumPackEntries = 200_000

export type LoaderName = 'Vanilla' | 'Fabric' | 'Forge' | 'NeoForge' | 'Quilt'
export type LoaderChoice = { loader: LoaderName; version: string }

type DownloadFile = { url: string; path: string; sha1?: string; size?: number }
export type InstallProgress = { phase: string; file: string; downloadedBytes: number; totalBytes: number }
type ProgressCallback = (progress: InstallProgress) => void
const activeDownloads = new Map<string, Promise<void>>()

async function fileSha1(filePath: string): Promise<string> {
  const hash = createHash('sha1')
  const stream = (await import('node:fs')).createReadStream(filePath)
  for await (const chunk of stream) hash.update(chunk)
  return hash.digest('hex')
}

async function downloadVerified(file: DownloadFile, onProgress?: ProgressCallback, progressState?: { completed: number; total: number }): Promise<void> {
  const active = activeDownloads.get(file.path)
  if (active) return active
  const operation = downloadVerifiedFile(file, onProgress, progressState)
  activeDownloads.set(file.path, operation)
  try {
    await operation
  } finally {
    activeDownloads.delete(file.path)
  }
}

async function downloadVerifiedFile(file: DownloadFile, onProgress?: ProgressCallback, progressState?: { completed: number; total: number }): Promise<void> {
  if (file.sha1 && await fs.stat(file.path).then(async (stat) => stat.isFile() && await fileSha1(file.path) === file.sha1!.toLowerCase()).catch(() => false)) {
    if (progressState && file.size) {
      progressState.completed += file.size
      onProgress?.({ phase: 'downloading', file: path.basename(file.path), downloadedBytes: Math.min(progressState.completed, progressState.total), totalBytes: progressState.total })
    }
    return
  }
  const url = new URL(file.url)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Источник игрового файла должен использовать HTTPS.')
  const response = await fetch(url, { headers: { 'User-Agent': userAgent } })
  if (!response.ok || !response.body) throw new Error(`Не удалось скачать файл (${response.status}): ${path.basename(file.path)}`)
  await fs.mkdir(path.dirname(file.path), { recursive: true })
  const temporary = `${file.path}.${randomUUID()}.download`
  const hash = createHash('sha1')
  let bytes = 0
  const transform = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length
      if (file.size !== undefined && bytes > file.size) {
        callback(new Error('Скачанный файл превышает размер из официального манифеста.'))
        return
      }
      hash.update(chunk)
      if (progressState) {
        progressState.completed += chunk.length
        onProgress?.({
          phase: 'downloading',
          file: path.basename(file.path),
          downloadedBytes: Math.min(progressState.completed, progressState.total),
          totalBytes: progressState.total,
        })
      }
      callback(null, chunk)
    },
  })
  const reader = response.body.getReader()
  const source = Readable.from((async function* () {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) return
        yield Buffer.from(value)
      }
    } finally {
      reader.releaseLock()
    }
  })())
  try {
    await pipeline(source, transform, createWriteStream(temporary, { flags: 'wx' }))
    if ((file.size !== undefined && bytes !== file.size) || (file.sha1 && hash.digest('hex') !== file.sha1.toLowerCase())) {
      throw new Error(`Проверка целостности не пройдена: ${path.basename(file.path)}`)
    }
    await fs.mkdir(path.dirname(file.path), { recursive: true })
    await fs.rm(file.path, { force: true })
    await fs.stat(temporary)
    await fs.rename(temporary, file.path)
  } catch (error) {
    await fs.rm(temporary, { force: true })
    throw error
  }
}

function withMavenArtifact(library: Record<string, unknown>): Record<string, unknown> {
  const downloads = library.downloads as { artifact?: Record<string, unknown> } | undefined
  if (downloads?.artifact) return library
  const name = typeof library.name === 'string' ? library.name : ''
  const [coordinate, extension = 'jar'] = name.split('@')
  const parts = coordinate.split(':')
  if (parts.length < 3 || parts.length > 4 || !parts.every((part) => /^[\w.+-]+$/.test(part)) || !/^[\w]+$/.test(extension)) {
    throw new Error(`Некорректная Maven-зависимость загрузчика: ${name || 'без имени'}.`)
  }
  const [group, artifact, version, classifier] = parts
  const baseUrl = typeof library.url === 'string' ? library.url : ''
  const repositoryUrl = new URL(baseUrl)
  if (repositoryUrl.protocol !== 'https:' || repositoryUrl.username || repositoryUrl.password) {
    throw new Error(`Для Maven-зависимости ${name} указан небезопасный адрес.`)
  }
  const artifactPath = `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}${classifier ? `-${classifier}` : ''}.${extension}`
  const hashes = library as { sha1?: string; size?: number }
  return {
    ...library,
    downloads: {
      ...downloads,
      artifact: {
        path: artifactPath,
        url: new URL(artifactPath, repositoryUrl.href.endsWith('/') ? repositoryUrl : `${repositoryUrl.href}/`).href,
        ...(hashes.sha1 ? { sha1: hashes.sha1 } : {}),
        ...(hashes.size ? { size: hashes.size } : {}),
      },
    },
  }
}

function mergeLoaderArguments(base: unknown, loader: unknown): unknown {
  if (!loader || typeof loader !== 'object') return base
  if (!base || typeof base !== 'object') return loader
  const baseArguments = base as Record<string, unknown>
  const loaderArguments = loader as Record<string, unknown>
  const mergeGroup = (group: 'jvm' | 'game') => {
    const baseValues = Array.isArray(baseArguments[group]) ? baseArguments[group] as unknown[] : []
    const loaderValues = Array.isArray(loaderArguments[group]) ? loaderArguments[group] as unknown[] : []
    const loaderText = loaderValues.flatMap((item) => {
      if (typeof item === 'string') return [item]
      if (!item || typeof item !== 'object' || !('value' in item)) return []
      const value = (item as { value: unknown }).value
      return Array.isArray(value) ? value.filter((part): part is string => typeof part === 'string') : typeof value === 'string' ? [value] : []
    }).join(' ')
    const containsBaseArguments = group === 'game'
      ? /--username|\$\{auth_player_name\}/.test(loaderText)
      : /(?:-cp|--class-path|\$\{classpath\})/.test(loaderText)
    return containsBaseArguments ? loaderValues : [...baseValues, ...loaderValues]
  }
  return {
    ...baseArguments,
    ...loaderArguments,
    jvm: mergeGroup('jvm'),
    game: mergeGroup('game'),
  }
}

async function downloadConcurrent<T>(items: T[], concurrency: number, operation: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex++
      if (index >= items.length) return
      await operation(items[index])
    }
  })
  await Promise.all(workers)
}

function minecraftOsName(): string {
  return process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux'
}

type MinecraftRule = { action: string; os?: { name?: string; arch?: string }; features?: Record<string, boolean> }

function isLibraryAllowed(rules: MinecraftRule[] | undefined, osName = minecraftOsName()): boolean {
  if (!rules?.length) return true
  let allowed = false
  for (const rule of rules) {
    const osMatches = !rule.os?.name || rule.os.name === osName
    // Feature-gated аргументы (custom resolution, demo, quick play и т. п.) мы не включаем,
    // поэтому правило активно только если все его feature-флаги равны false.
    const featuresMatch = !rule.features || Object.values(rule.features).every((value) => value === false)
    if (osMatches && featuresMatch) allowed = rule.action === 'allow'
  }
  return allowed
}

const javaVersionCache = new Map<string, number | null>()

/** Минимальная версия Java для Minecraft: 8 для старых версий, 17 для 1.17–1.20.4, 21 для 1.20.5–1.x и 25 для 26+. */
export function requiredJavaMajor(minecraftVersion: string): number {
  const [majorText = '1', minorText = '0', patchText = '0'] = minecraftVersion.split(/[.\-+]/)
  const major = Number(majorText) || 1
  const minor = Number(minorText) || 0
  const patch = Number(patchText) || 0
  if (major >= 26) return 25
  if (major > 1 || minor >= 21 || (minor === 20 && patch >= 5)) return 21
  if (minor >= 17) return 17
  return 8
}

function javaBinaryName(executable: 'java' | 'javaw'): string {
  return process.platform === 'win32' ? `${executable}.exe` : executable
}

async function isFile(candidate: string): Promise<boolean> {
  return fs.stat(candidate).then((stat) => stat.isFile()).catch(() => false)
}

async function childDirectories(root: string): Promise<string[]> {
  return fs.readdir(root, { withFileTypes: true })
    .then((entries) => entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name))
    .catch(() => [] as string[])
}

function parseJavaMajor(output: string): number | null {
  const match = output.match(/version "(?:1\.)?(\d+)/)
  if (!match) return null
  const major = Number(match[1])
  return Number.isFinite(major) && major > 0 ? major : null
}

function probeJavaMajor(executable: string): Promise<number | null> {
  const cached = javaVersionCache.get(executable)
  if (cached !== undefined) return Promise.resolve(cached)
  return new Promise<number | null>((resolve) => {
    let output = ''
    let settled = false
    const finish = (value: number | null) => {
      if (settled) return
      settled = true
      javaVersionCache.set(executable, value)
      resolve(value)
    }
    let child: ChildProcess
    try {
      child = spawn(executable, ['-version'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    } catch {
      finish(null)
      return
    }
    const timer = setTimeout(() => { child.kill(); finish(null) }, 5000)
    const collect = (chunk: Buffer) => { output += chunk.toString('utf8') }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    child.once('error', () => { clearTimeout(timer); finish(null) })
    child.once('exit', () => { clearTimeout(timer); finish(parseJavaMajor(output)) })
  })
}

function pathJavaBinDirectories(): Promise<string[]> {
  const command = process.platform === 'win32' ? 'where' : 'which'
  const args = process.platform === 'win32' ? ['java'] : ['-a', 'java']
  return new Promise<string[]>((resolve) => {
    let output = ''
    let settled = false
    const finish = (value: string[]) => { if (!settled) { settled = true; resolve(value) } }
    let child: ChildProcess
    try {
      child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], shell: false })
    } catch {
      finish([])
      return
    }
    const timer = setTimeout(() => { child.kill(); finish([]) }, 5000)
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString('utf8') })
    child.once('error', () => { clearTimeout(timer); finish([]) })
    child.once('exit', () => {
      clearTimeout(timer)
      finish(output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && path.isAbsolute(line)).map((line) => path.dirname(line)))
    })
  })
}

function javaSearchRoots(): string[] {
  const roots: string[] = []
  if (process.platform === 'win32') {
    const bases = [
      process.env['ProgramFiles'],
      process.env['ProgramFiles(x86)'],
      process.env['LOCALAPPDATA'] ? path.join(process.env['LOCALAPPDATA'], 'Programs') : undefined,
    ].filter((value): value is string => Boolean(value))
    const vendors = ['Java', 'Eclipse Adoptium', 'Eclipse Foundation', 'Microsoft', 'Zulu', 'Amazon Corretto', 'BellSoft', 'Semeru', 'AdoptOpenJDK']
    for (const base of bases) for (const vendor of vendors) roots.push(path.join(base, vendor))
    if (process.env['USERPROFILE']) roots.push(path.join(process.env['USERPROFILE'], '.jdks'))
    if (process.env['APPDATA']) roots.push(path.join(process.env['APPDATA'], '.minecraft', 'runtime'))
  } else {
    roots.push('/usr/lib/jvm', '/usr/java', '/opt/java', '/Library/Java/JavaVirtualMachines')
  }
  return roots
}

async function javaBinDirectories(extraRoots: string[] = []): Promise<string[]> {
  const directories = new Set<string>()
  if (process.env.JAVA_HOME) directories.add(path.join(process.env.JAVA_HOME, 'bin'))
  for (const directory of await pathJavaBinDirectories()) directories.add(directory)
  for (const root of [...javaSearchRoots(), ...extraRoots]) {
    for (const entry of await childDirectories(root)) {
      const nested = path.join(root, entry)
      directories.add(path.join(nested, 'bin'))
      // Runtime Mojang и обёртки вроде javapath кладут java.exe уровнем глубже.
      for (const child of await childDirectories(nested)) directories.add(path.join(nested, child, 'bin'))
    }
  }
  return [...directories]
}

/**
 * Находит подходящую Java для запуска Minecraft.
 *
 * Заданный вручную путь имеет приоритет. Иначе лаунчер сам ищет Java в JAVA_HOME, PATH,
 * типовых папках установки JDK и runtime Mojang, определяет версию через `java -version`
 * и выбирает минимальную совместимую. Для запуска игры предпочитает javaw.exe (без окна консоли).
 */
export async function resolveJavaExecutable(requiredMajor: number, configuredPath = '', options: { preferConsole?: boolean; extraRoots?: string[] } = {}): Promise<string> {
  const javaName = javaBinaryName('java')
  const candidates: Array<{ path: string; major: number }> = []
  const seen = new Set<string>()
  if (configuredPath && path.isAbsolute(configuredPath) && await isFile(configuredPath)) {
    const configuredProbe = path.join(path.dirname(configuredPath), javaName)
    const probe = await isFile(configuredProbe) ? configuredProbe : configuredPath
    const major = await probeJavaMajor(probe)
    if (major) candidates.push({ path: probe, major })
  }
  for (const directory of await javaBinDirectories(options.extraRoots)) {
    const executable = path.join(directory, javaName)
    if (seen.has(executable) || !(await isFile(executable))) continue
    seen.add(executable)
    const major = await probeJavaMajor(executable)
    if (major) candidates.push({ path: executable, major })
  }
  if (!candidates.length) throw new Error(`Не удалось определить версию Java. Для этой версии Minecraft нужна Java ${requiredMajor} или новее.`)
  const compatible = candidates.filter((item) => item.major >= requiredMajor).sort((a, b) => a.major - b.major)
  if (!compatible.length) {
    const newestFound = Math.max(...candidates.map((candidate) => candidate.major))
    throw new Error(`Для этой версии Minecraft нужна Java ${requiredMajor} или новее. Найдена только Java ${newestFound}.`)
  }
  const chosen = compatible[0]
  if (options.preferConsole) return chosen.path
  const withoutConsole = path.join(path.dirname(chosen.path), javaBinaryName('javaw'))
  return await isFile(withoutConsole) ? withoutConsole : chosen.path
}

const javaRuntimeCatalogUrl = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json'
let javaRuntimeCatalog: Promise<Record<string, Record<string, Array<{ manifest: { url: string }; version: { name: string } }>>>> | null = null

function javaRuntimePlatform(): string {
  if (process.platform === 'win32') return process.arch === 'x64' ? 'windows-x64' : process.arch === 'arm64' ? 'windows-arm64' : 'windows-x86'
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac-os-arm64' : 'mac-os'
  return process.arch === 'ia32' ? 'linux-i386' : 'linux'
}

function javaRuntimeComponents(requiredMajor: number): string[] {
  if (requiredMajor >= 25) return ['java-runtime-epsilon', 'java-runtime-delta', 'java-runtime-gamma', 'java-runtime-beta']
  if (requiredMajor >= 21) return ['java-runtime-delta', 'java-runtime-gamma', 'java-runtime-beta']
  if (requiredMajor >= 17) return ['java-runtime-gamma', 'java-runtime-beta', 'java-runtime-delta']
  return ['jre-legacy', 'java-runtime-alpha', 'java-runtime-gamma']
}

async function fetchMojangJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent } })
  if (!response.ok) throw new Error(`Не удалось получить Java runtime Mojang (${response.status}).`)
  return response.json() as Promise<T>
}

/**
 * Скачивает официальный Java runtime Mojang (тот же, что использует официальный лаунчер)
 * и распаковывает его в `<minecraftPath>/runtime/<component>/<platform>`.
 * Возвращает путь к javaw/java, которым можно запускать игру.
 */
export async function installMojangJavaRuntime(minecraftPath: string, requiredMajor: number, onProgress?: ProgressCallback): Promise<string> {
  const platform = javaRuntimePlatform()
  const probeBinary = javaBinaryName('java')
  const launchBinary = javaBinaryName('javaw')
  if (!javaRuntimeCatalog) javaRuntimeCatalog = fetchMojangJson(javaRuntimeCatalogUrl)
  const catalog = await javaRuntimeCatalog
  const platformProducts = catalog[platform]
  if (!platformProducts) throw new Error(`Mojang не публикует Java runtime для платформы ${platform}.`)
  const component = javaRuntimeComponents(requiredMajor).find((name) => platformProducts[name]?.length)
  if (!component) throw new Error('Mojang не публикует подходящий Java runtime для этой версии Minecraft.')
  const version = platformProducts[component][0].version.name
  const directory = path.join(minecraftPath, 'runtime', component, platform)
  const binDirectory = path.join(directory, 'bin')
  const consoleBinary = path.join(binDirectory, probeBinary)
  const preferredBinary = path.join(binDirectory, launchBinary)
  if (await isFile(consoleBinary)) return (await isFile(preferredBinary)) ? preferredBinary : consoleBinary

  const manifest = await fetchMojangJson<{ files: Record<string, { type: string; executable?: boolean; target?: string; downloads?: { raw?: { url: string; sha1: string; size?: number } } }> }>(platformProducts[component][0].manifest.url)
  await fs.mkdir(directory, { recursive: true })
  const downloads: DownloadFile[] = []
  const links: Array<{ path: string; target: string }> = []
  for (const [name, entry] of Object.entries(manifest.files)) {
    if (name.startsWith('META-INF/')) continue
    const destination = safeArchivePath(directory, name)
    if (entry.type === 'directory') {
      await fs.mkdir(destination, { recursive: true })
      continue
    }
    if (entry.type === 'link') {
      if (entry.target && process.platform !== 'win32') links.push({ path: destination, target: entry.target })
      continue
    }
    const raw = entry.downloads?.raw
    if (raw) downloads.push({ url: raw.url, path: destination, sha1: raw.sha1, size: raw.size })
  }
  const progressState = { completed: 0, total: downloads.reduce((total, item) => total + (item.size ?? 0), 0) || 1 }
  onProgress?.({ phase: 'preparing', file: `Java ${version}`, downloadedBytes: 0, totalBytes: progressState.total })
  await downloadConcurrent(downloads, 12, (file) => downloadVerified(file, onProgress, progressState))
  for (const link of links) {
    await fs.mkdir(path.dirname(link.path), { recursive: true })
    await fs.rm(link.path, { force: true })
    await fs.symlink(link.target, link.path).catch(() => undefined)
  }
  if (process.platform !== 'win32') {
    for (const [name, entry] of Object.entries(manifest.files)) {
      if (!entry.executable || name.startsWith('META-INF/')) continue
      await fs.chmod(safeArchivePath(directory, name), 0o755).catch(() => undefined)
    }
  }
  if (await isFile(consoleBinary)) return (await isFile(preferredBinary)) ? preferredBinary : consoleBinary
  throw new Error('Java runtime скачан, но исполняемый файл не найден.')
}

async function extractNativeJar(archivePath: string, destination: string): Promise<void> {
  const zip = await openZip(archivePath)
  try {
    for await (const entry of zip.eachEntry()) {
      if (entry.fileName.endsWith('/') || entry.fileName.startsWith('META-INF/')) continue
      const filePath = safeArchivePath(destination, entry.fileName)
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      const stream = await zip.openReadStreamPromise(entry)
      await fs.rm(filePath, { force: true })
      await pipeline(stream, createWriteStream(filePath, { flags: 'wx' }))
    }
  } finally {
    zip.close()
  }
}

export async function installVanillaVersion(gameDirectory: string, versionId: string, onProgress?: ProgressCallback): Promise<Record<string, unknown>> {
  if (!/^[\w.-]{1,64}$/.test(versionId)) throw new Error('Некорректный идентификатор версии Minecraft.')
  const manifest = await fetchJson<{ versions: Array<{ id: string; url: string }> }>('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')
  const version = manifest.versions.find((item) => item.id === versionId)
  if (!version) throw new Error(`Версия Minecraft ${versionId} отсутствует в официальном манифесте.`)
  const metadata = await fetchJson<{
    id: string
    downloads?: { client?: { url: string; sha1: string; size: number } }
    assetIndex?: { id: string; url: string; sha1: string; size: number }
    libraries?: Array<{
      rules?: Array<{ action: string; os?: { name?: string } }>
      natives?: Record<string, string>
      downloads?: { artifact?: { path: string; url: string; sha1?: string; size?: number }; classifiers?: Record<string, { path: string; url: string; sha1?: string; size?: number }> }
    }>
  }>(version.url)
  if (!metadata.downloads?.client || !metadata.assetIndex) throw new Error('Официальные метаданные этой версии не содержат client.jar или asset index.')
  const versionDirectory = path.join(gameDirectory, 'versions', versionId)
  await fs.mkdir(versionDirectory, { recursive: true })
  await fs.writeFile(path.join(versionDirectory, `${versionId}.json`), JSON.stringify(metadata, null, 2), 'utf8')
  const osName = minecraftOsName()
  const nativeLibraries: string[] = []
  const tasks: DownloadFile[] = [
    { ...metadata.downloads.client, path: path.join(versionDirectory, `${versionId}.jar`) },
    ...metadata.libraries?.filter((library) => isLibraryAllowed(library.rules)).flatMap((library) => {
      const artifact = library.downloads?.artifact
      const files: DownloadFile[] = artifact ? [{ ...artifact, path: path.join(gameDirectory, 'libraries', ...artifact.path.split('/')) }] : []
      const nativeName = library.natives?.[osName]?.replace('${arch}', process.arch === 'x64' ? '64' : '32')
      const native = nativeName ? library.downloads?.classifiers?.[nativeName] : undefined
      if (native) {
        const nativePath = path.join(gameDirectory, 'libraries', ...native.path.split('/'))
        files.push({ ...native, path: nativePath })
        nativeLibraries.push(nativePath)
      }
      return files
    }) ?? [],
  ]
  const assetIndexPath = path.join(gameDirectory, 'assets', 'indexes', `${metadata.assetIndex.id}.json`)
  const assetIndexUrl = new URL(metadata.assetIndex.url)
  if (assetIndexUrl.protocol !== 'https:') throw new Error('Официальный asset index должен загружаться по HTTPS.')
  const assetIndexResponse = await fetch(assetIndexUrl, { headers: { 'User-Agent': userAgent } })
  if (!assetIndexResponse.ok) throw new Error(`Не удалось получить список игровых ресурсов (${assetIndexResponse.status}).`)
  const assetIndexBuffer = Buffer.from(await assetIndexResponse.arrayBuffer())
  const assetIndexHash = createHash('sha1').update(assetIndexBuffer).digest('hex')
  if ((metadata.assetIndex.size && assetIndexBuffer.byteLength !== metadata.assetIndex.size) || assetIndexHash !== metadata.assetIndex.sha1.toLowerCase()) {
    throw new Error('Проверка целостности списка игровых ресурсов не пройдена.')
  }
  const assetIndex = JSON.parse(assetIndexBuffer.toString('utf8')) as {
    objects: Record<string, { hash: string; size: number }>
  }
  const assets = Object.values(assetIndex.objects).map(({ hash, size }) => ({
    url: `https://resources.download.minecraft.net/${hash.slice(0, 2)}/${hash}`,
    path: path.join(gameDirectory, 'assets', 'objects', hash.slice(0, 2), hash),
    sha1: hash,
    size,
  }))
  const allTasks = [...tasks, ...assets]
  const progressState = {
    completed: assetIndexBuffer.byteLength,
    total: allTasks.reduce((total, item) => total + (item.size ?? 0), assetIndexBuffer.byteLength) || 1,
  }
  await fs.mkdir(path.dirname(assetIndexPath), { recursive: true })
  await fs.writeFile(assetIndexPath, assetIndexBuffer)
  onProgress?.({ phase: 'downloading', file: '', downloadedBytes: 0, totalBytes: progressState.total })
  await downloadConcurrent(allTasks, 12, (file) => downloadVerified(file, onProgress, progressState))
  const nativeDirectory = path.join(versionDirectory, 'natives')
  await fs.mkdir(nativeDirectory, { recursive: true })
  for (const native of nativeLibraries) await extractNativeJar(native, nativeDirectory)
  return metadata as Record<string, unknown>
}

export async function installLoaderProfile(gameDirectory: string, metadata: Record<string, unknown>, gameVersion: string, loader: string, configuredJavaPath = '', requestedLoaderVersion?: string): Promise<Record<string, unknown>> {
  if (loader === 'Vanilla') return metadata
  if (loader === 'Fabric' || loader === 'Quilt') {
    const baseUrl = loader === 'Fabric' ? 'https://meta.fabricmc.net/v2' : 'https://meta.quiltmc.org/v3'
    const available = await fetchJson<Array<{ loader: { version: string } }>>(`${baseUrl}/versions/loader/${encodeURIComponent(gameVersion)}`)
    const loaderVersion = requestedLoaderVersion
      ? available.find((entry) => entry.loader.version === requestedLoaderVersion)?.loader.version
      : available[0]?.loader.version
    if (!loaderVersion) throw new Error(`${loader} не опубликован для Minecraft ${gameVersion}.`)
    const profileUrl = `${baseUrl}/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`
    const profile = await fetchJson<Record<string, unknown>>(profileUrl)
    const baseLibraries = (metadata.libraries as Array<Record<string, unknown>> | undefined) ?? []
    const loaderLibraries = ((profile.libraries as Array<Record<string, unknown>> | undefined) ?? []).map(withMavenArtifact)
    const merged = {
      ...metadata,
      id: profile.id ?? `${gameVersion}-${loader.toLowerCase()}-${loaderVersion}`,
      mainClass: profile.mainClass ?? metadata.mainClass,
      libraries: [...new Map([...baseLibraries, ...loaderLibraries].map((library) => [String(library.name), library])).values()],
      arguments: mergeLoaderArguments(metadata.arguments, profile.arguments),
      minecraftArguments: profile.minecraftArguments ?? metadata.minecraftArguments,
    }
    const tasks = loaderLibraries.flatMap((library) => {
      const downloads = library.downloads as { artifact?: { path: string; url: string; sha1?: string; size?: number } } | undefined
      const artifact = downloads?.artifact
      return artifact ? [{ ...artifact, path: path.join(gameDirectory, 'libraries', ...artifact.path.split('/')) }] : []
    })
    await downloadConcurrent(tasks, 8, downloadVerified)
    const versionsDirectory = path.join(gameDirectory, 'versions', String(merged.id))
    await fs.mkdir(versionsDirectory, { recursive: true })
    await fs.cp(path.join(gameDirectory, 'versions', gameVersion, 'natives'), path.join(versionsDirectory, 'natives'), { recursive: true, force: true })
    await fs.copyFile(
      path.join(gameDirectory, 'versions', gameVersion, `${gameVersion}.jar`),
      path.join(versionsDirectory, `${merged.id}.jar`),
    )
    await fs.writeFile(path.join(versionsDirectory, `${merged.id}.json`), JSON.stringify(merged, null, 2), 'utf8')
    return merged
  }
  if (loader === 'Forge' || loader === 'NeoForge') {
    if (requestedLoaderVersion && !/^[\w.-]+$/.test(requestedLoaderVersion)) {
      throw new Error(`Некорректная версия загрузчика ${loader}.`)
    }
    const choice = requestedLoaderVersion
      ? { loader, version: requestedLoaderVersion }
      : (await availableLoaders(gameVersion)).find((item) => item.loader === loader)
    if (!choice) throw new Error(`${loader} не опубликован для Minecraft ${gameVersion}.`)
    const artifactVersion = loader === 'Forge' ? `${gameVersion}-${choice.version}` : choice.version
    const mavenRoot = loader === 'Forge'
      ? 'https://maven.minecraftforge.net/net/minecraftforge/forge'
      : 'https://maven.neoforged.net/releases/net/neoforged/neoforge'
    const artifactName = loader === 'Forge' ? `forge-${artifactVersion}-installer.jar` : `neoforge-${artifactVersion}-installer.jar`
    const installerUrl = `${mavenRoot}/${encodeURIComponent(artifactVersion)}/${artifactName}`
    const installerPath = path.join(gameDirectory, `.nexium-${loader.toLowerCase()}-${randomUUID()}.jar`)
    try {
      await downloadVerified({ url: installerUrl, path: installerPath })
      const profilesPath = path.join(gameDirectory, 'launcher_profiles.json')
      const profilesExist = await fs.access(profilesPath).then(() => true).catch(() => false)
      if (!profilesExist) {
        const now = new Date().toISOString()
        await fs.writeFile(profilesPath, JSON.stringify({
          profiles: {
            NEXIUM: {
              name: 'NEXIUM',
              type: 'custom',
              created: now,
              lastUsed: now,
              lastVersionId: gameVersion,
              gameDir: gameDirectory,
            },
          },
          selectedProfile: 'NEXIUM',
          clientToken: randomUUID(),
          version: 3,
        }, null, 2), 'utf8')
      }
      const javaPath = await resolveJavaExecutable(requiredJavaMajor(gameVersion), configuredJavaPath, { preferConsole: true })
      await new Promise<void>((resolve, reject) => {
        const child = spawn(javaPath, ['-jar', installerPath, '--installClient', gameDirectory], { cwd: gameDirectory, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
        let output = ''
        child.stdout?.on('data', (chunk: Buffer) => { output = `${output}${chunk.toString()}`.slice(-6000) })
        child.stderr?.on('data', (chunk: Buffer) => { output = `${output}${chunk.toString()}`.slice(-6000) })
        child.once('error', reject)
        child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${loader} installer завершился с кодом ${code ?? 'неизвестно'}.${output ? ` ${output.trim()}` : ''}`)))
      })
    } finally {
      await fs.rm(installerPath, { force: true })
    }
    const versionRoot = path.join(gameDirectory, 'versions')
    const profiles = await Promise.all((await fs.readdir(versionRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const file = path.join(versionRoot, entry.name, `${entry.name}.json`)
        const profile = await fs.readFile(file, 'utf8').then((json) => JSON.parse(json) as Record<string, unknown>).catch(() => null)
        const profileId = String(profile?.id ?? '').toLowerCase()
        return profile && profile.inheritsFrom === gameVersion && profileId.includes(loader.toLowerCase()) &&
          (!requestedLoaderVersion || profileId.includes(requestedLoaderVersion.toLowerCase()))
          ? { file, profile }
          : null
      }))
    const installed = profiles.find((profile) => profile !== null)
    if (!installed) throw new Error(`${loader} installer завершился, но профиль Minecraft не найден.`)
    const loaderLibraries = ((installed.profile.libraries as Array<Record<string, unknown>> | undefined) ?? []).map(withMavenArtifact)
    const baseLibraries = (metadata.libraries as Array<Record<string, unknown>> | undefined) ?? []
    const merged = {
      ...metadata,
      ...installed.profile,
      id: String(installed.profile.id ?? path.basename(path.dirname(installed.file))),
      mainClass: installed.profile.mainClass ?? metadata.mainClass,
      libraries: [...new Map([...baseLibraries, ...loaderLibraries].map((library) => [String(library.name), library])).values()],
      arguments: mergeLoaderArguments(metadata.arguments, installed.profile.arguments),
      minecraftArguments: installed.profile.minecraftArguments ?? metadata.minecraftArguments,
    }
    const targetVersionDirectory = path.join(versionRoot, String(merged.id))
    await fs.mkdir(targetVersionDirectory, { recursive: true })
    await fs.cp(path.join(gameDirectory, 'versions', gameVersion, 'natives'), path.join(targetVersionDirectory, 'natives'), { recursive: true, force: true })
    await fs.copyFile(path.join(gameDirectory, 'versions', gameVersion, `${gameVersion}.jar`), path.join(targetVersionDirectory, `${merged.id}.jar`))
    await fs.writeFile(path.join(targetVersionDirectory, `${merged.id}.json`), JSON.stringify(merged, null, 2), 'utf8')
    const artifacts = loaderLibraries.flatMap((library) => {
      const downloads = library.downloads as { artifact?: { path: string; url: string; sha1?: string; size?: number } } | undefined
      const artifact = downloads?.artifact
      return artifact ? [{ ...artifact, path: path.join(gameDirectory, 'libraries', ...artifact.path.split('/')) }] : []
    })
    await downloadConcurrent(artifacts, 8, downloadVerified)
    return merged
  }
  throw new Error(`Установка загрузчика ${loader} не поддерживается.`)
}

export type MinecraftUserType = 'msa' | 'legacy' | 'mojang'

export type MinecraftSession = {
  username: string
  uuid: string
  accessToken: string
  /** Authentication type reported by the trusted account provider. */
  userType?: MinecraftUserType
  /** Значение для ${version_type}/--versionType. Для релизных оффлайн-запусков — 'release'. */
  versionType?: string
  xuid?: string
  clientId?: string
}

export type MinecraftLaunchCommand = { executable: string; args: string[]; cwd: string; mainClass: string; classpath: string }

/** Заглушка access token: оффлайн-серверы её не проверяют, но клиент требует непустое значение. */
export const OFFLINE_ACCESS_TOKEN = '00000000000000000000000000000000'

/**
 * Оффлайн-UUID игрока — UUID версии 3 (name-based MD5).
 *
 * Точная копия Java-метода `UUID.nameUUIDFromBytes(("OfflinePlayer:" + name).getBytes(UTF_8))`,
 * который использует сам Minecraft в offline-mode: сервер с `online-mode=false`
 * вычисляет UUID так же, поэтому профиль совпадает с серверным.
 */
export function offlinePlayerUuid(username: string): string {
  const bytes = Buffer.from(createHash('md5').update(`OfflinePlayer:${username}`, 'utf8').digest())
  bytes[6] = (bytes[6] & 0x0f) | 0x30 // версия 3 (MD5)
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // вариант RFC 4122
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Собирает оффлайн-сессию из никнейма: сгенерированный UUID + статический access token-заглушка. */
export function createOfflineSession(username: string): MinecraftSession {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
    throw new Error('Ник должен содержать 3–16 латинских букв, цифр или знаков подчёркивания.')
  }
  return {
    username,
    uuid: offlinePlayerUuid(username),
    accessToken: OFFLINE_ACCESS_TOKEN,
    userType: 'legacy',
    versionType: 'release',
  }
}

function parseLegacyArguments(value: string): string[] {
  const args: string[] = []
  let token = ''
  let quote: '"' | "'" | null = null
  let started = false

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (quote) {
      if (character === quote) {
        quote = null
      } else if (character === '\\' && (value[index + 1] === quote || value[index + 1] === '\\')) {
        token += value[index + 1]
        index += 1
      } else {
        token += character
      }
      started = true
    } else if (character === '"' || character === "'") {
      quote = character
      started = true
    } else if (/\s/.test(character)) {
      if (started) args.push(token)
      token = ''
      started = false
    } else {
      token += character
      started = true
    }
  }
  if (quote) throw new Error('Строка аргументов Minecraft содержит незакрытую кавычку.')
  if (started) args.push(token)
  return args
}

function argumentValues(version: Record<string, unknown>, gameDirectory: string, session: MinecraftSession, memoryMb: number, minecraftLanguage = 'en_US'): { mainClass: string; classpath: string; args: string[] } {
  if (!session.username || !session.uuid || !session.accessToken) throw new Error('Для формирования команды запуска требуется авторизованная игровая сессия.')
  const versionId = String(version.id ?? '')
  const versionDirectory = path.join(gameDirectory, 'versions', versionId)
  const clientJar = path.join(versionDirectory, `${versionId}.jar`)
  const libraries = (version.libraries as Array<{ downloads?: { artifact?: { path?: string } }; rules?: Array<{ action: string; os?: { name?: string } }> }> | undefined) ?? []
  const activeLibraries = libraries.filter((library) => isLibraryAllowed(library.rules))
  const classpathParts = activeLibraries
    .map((library) => library.downloads?.artifact?.path)
    .filter((filePath): filePath is string => Boolean(filePath))
    .map((filePath) => path.join(gameDirectory, 'libraries', ...filePath.split('/')))
  classpathParts.push(clientJar)
  const replacements: Record<string, string> = {
    '${auth_player_name}': session.username,
    '${auth_uuid}': session.uuid,
    '${auth_access_token}': session.accessToken,
    '${user_type}': session.userType ?? 'msa',
    '${version_name}': versionId,
    '${game_directory}': gameDirectory,
    '${assets_root}': path.join(gameDirectory, 'assets'),
    '${assets_index_name}': String((version.assetIndex as { id?: string } | undefined)?.id ?? versionId),
    '${auth_xuid}': session.xuid ?? '',
    '${clientid}': session.clientId ?? '',
    '${version_type}': session.versionType ?? String(version.type ?? 'release'),
    '${launcher_name}': 'NEXIUM',
    '${launcher_version}': '0.1.0',
    '${language}': minecraftLanguage,
    '${natives_directory}': path.join(versionDirectory, 'natives'),
    '${classpath}': classpathParts.join(path.delimiter),
    '${classpath_separator}': path.delimiter,
    '${library_directory}': path.join(gameDirectory, 'libraries'),
  }
  const replace = (value: string) => Object.entries(replacements).reduce((result, [key, replacement]) => result.replaceAll(key, replacement), value)
  const argumentsObject = version.arguments as { jvm?: Array<string | { rules?: Array<{ action: string; os?: { name?: string } }>; value: string | string[] }>; game?: Array<string | { rules?: Array<{ action: string; os?: { name?: string } }>; value: string | string[] }> } | undefined
  const flatten = (items: typeof argumentsObject extends undefined ? never : NonNullable<typeof argumentsObject>['game'] = []) => items.flatMap((item) => {
    if (typeof item === 'string') return [replace(item)]
    if (!isLibraryAllowed(item.rules)) return []
    const values = Array.isArray(item.value) ? item.value : [item.value]
    return values.map(replace)
  })
  const jvmArgs = argumentsObject ? flatten(argumentsObject.jvm) : ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}']
  const gameArgs = argumentsObject
    ? flatten(argumentsObject.game)
    : parseLegacyArguments(String(version.minecraftArguments ?? '')).map(replace)
  const mainClass = String(version.mainClass ?? '')
  if (!mainClass) throw new Error('В JSON версии Minecraft отсутствует mainClass.')
  const classpath = classpathParts.join(path.delimiter)
  if (!argumentsObject && gameArgs.length === 0) {
    gameArgs.push(
      '--username', session.username,
      '--version', versionId,
      '--gameDir', gameDirectory,
      '--assetsDir', path.join(gameDirectory, 'assets'),
      '--assetIndex', String((version.assetIndex as { id?: string } | undefined)?.id ?? versionId),
      '--uuid', session.uuid,
      '--accessToken', session.accessToken,
      '--userType', session.userType ?? 'msa',
      '--versionType', session.versionType ?? String(version.type ?? 'release'),
    )
    if (session.xuid) gameArgs.push('--xuid', session.xuid)
    if (session.clientId) gameArgs.push('--clientId', session.clientId)
  }
  const languageArgumentIndex = gameArgs.indexOf('--lang')
  if (languageArgumentIndex >= 0 && languageArgumentIndex + 1 < gameArgs.length) {
    gameArgs[languageArgumentIndex + 1] = minecraftLanguage
  } else {
    const inlineLanguageArgumentIndex = gameArgs.findIndex((argument) => argument.startsWith('--lang='))
    if (inlineLanguageArgumentIndex >= 0) gameArgs[inlineLanguageArgumentIndex] = `--lang=${minecraftLanguage}`
    else gameArgs.push('--lang', minecraftLanguage)
  }
  const resolvedJvmArgs = jvmArgs.map(replace).filter((argument) => !/^-Xmx\d+[kKmMgGtT]?$/.test(argument))
  return {
    mainClass,
    classpath,
    args: [
      ...resolvedJvmArgs,
      `-Xmx${Math.max(512, Math.floor(memoryMb))}M`,
      mainClass,
      ...gameArgs.map(replace),
    ],
  }
}

export function buildLaunchArguments(version: Record<string, unknown>, gameDirectory: string, session: MinecraftSession, memoryMb: number, minecraftLanguage = 'en_US'): string[] {
  return argumentValues(version, gameDirectory, session, memoryMb, minecraftLanguage).args
}

export function buildLaunchCommand(javaPath: string, version: Record<string, unknown>, gameDirectory: string, session: MinecraftSession, memoryMb: number, minecraftLanguage = 'en_US'): MinecraftLaunchCommand {
  if (!path.isAbsolute(javaPath)) throw new Error('Укажите полный путь к Java.')
  const command = argumentValues(version, gameDirectory, session, memoryMb, minecraftLanguage)
  return {
    executable: javaPath,
    args: command.args,
    cwd: gameDirectory,
    mainClass: command.mainClass,
    classpath: command.classpath,
  }
}

export type InstanceManifestSource = { minecraftVersion: string; loader: string; versionId?: string | null }

/**
 * Читает JSON-манифест версии игры из папки инстанса.
 *
 * Для loader-сборки ищет профиль по id, mainClass или библиотекам загрузчика и никогда
 * не подменяет отсутствующий профиль vanilla. Для Vanilla использует сохранённый id
 * или `versions/{minecraftVersion}/{minecraftVersion}.json`.
 */
export async function readInstanceManifest(gameDirectory: string, instance: InstanceManifestSource): Promise<Record<string, unknown>> {
  const versionRoot = path.join(gameDirectory, 'versions')
  const readVersion = async (versionId: string): Promise<Record<string, unknown> | null> => {
    if (!/^[\w.\-+]{1,128}$/.test(versionId)) return null
    try {
      return JSON.parse(await fs.readFile(path.join(versionRoot, versionId, `${versionId}.json`), 'utf8')) as Record<string, unknown>
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }
  let directories: string[] = []
  try {
    directories = (await fs.readdir(versionRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const isLoaderProfile = (manifest: Record<string, unknown>) => {
    const id = String(manifest.id ?? '').toLowerCase()
    const mainClass = String(manifest.mainClass ?? '').toLowerCase()
    const libraries = JSON.stringify(manifest.libraries ?? []).toLowerCase()
    const marker = instance.loader.toLowerCase()
    const libraryMarkers: Record<string, string[]> = {
      Fabric: ['net.fabricmc'],
      Quilt: ['org.quiltmc'],
      Forge: ['net.minecraftforge', 'minecraftforge'],
      NeoForge: ['net.neoforged'],
    }
    return id.includes(marker) ||
      mainClass.includes(marker) ||
      (libraryMarkers[instance.loader] ?? []).some((library) => libraries.includes(library))
  }
  if (instance.loader && instance.loader !== 'Vanilla') {
    const candidates = instance.versionId ? [instance.versionId, ...directories.filter((id) => id !== instance.versionId)] : directories
    for (const id of candidates) {
      const manifest = await readVersion(id)
      if (manifest && String(manifest.id ?? id) !== instance.minecraftVersion && isLoaderProfile(manifest)) return manifest
    }
    throw new Error(`Не найден профиль ${instance.loader} для сборки «${instance.minecraftVersion}». Переустановите файлы сборки.`)
  }
  if (instance.versionId && instance.versionId !== instance.minecraftVersion) {
    const manifest = await readVersion(instance.versionId)
    if (manifest) return manifest
  }
  const vanilla = await readVersion(instance.minecraftVersion)
  if (vanilla) return vanilla
  throw new Error(`Не найден манифест версии Minecraft ${instance.minecraftVersion}. Переустановите файлы сборки.`)
}

export type MinecraftProcessHandle = {
  process: ChildProcess
  /** Резолвится, когда процесс Java успешно стартовал; отклоняется при ошибке spawn. */
  spawned: Promise<void>
  /** Резолвится с кодом выхода при завершении игры. */
  exited: Promise<number | null>
}

export type MinecraftLaunchOptions = {
  onSpawned?: (process: ChildProcess) => void
  onOutput?: (chunk: string) => void
  onExit?: (code: number | null) => void
  onClose?: (code: number | null) => void
  onError?: (error: Error) => void
}

/**
 * Запускает Minecraft напрямую через `spawn(executable, args)` без shell-строки.
 * Возвращает handle процесса и отдельные промисы события spawn/exit, чтобы main
 * мог скрыть окно лаунчера после успешного старта и отреагировать на выход из игры.
 */
export function launchMinecraft(command: MinecraftLaunchCommand, options: MinecraftLaunchOptions = {}): MinecraftProcessHandle {
  if (!path.isAbsolute(command.executable)) throw new Error('Укажите полный путь к Java.')
  if (!path.isAbsolute(command.cwd)) throw new Error('Рабочая папка Minecraft должна быть абсолютным путём.')
  const child = spawn(command.executable, command.args, {
    cwd: command.cwd,
    shell: false,
    windowsHide: true,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const forward = (chunk: Buffer) => options.onOutput?.(chunk.toString('utf8'))
  child.stdout?.on('data', forward)
  child.stderr?.on('data', forward)
  const spawned = new Promise<void>((resolve, reject) => {
    child.once('spawn', () => {
      options.onSpawned?.(child)
      resolve()
    })
    child.once('error', (error) => {
      options.onError?.(error)
      reject(error)
    })
  })
  const exited = new Promise<number | null>((resolve) => {
    child.once('exit', (code) => {
      options.onExit?.(code)
      resolve(code)
    })
  })
  child.once('close', (code) => options.onClose?.(code))
  return { process: child, spawned, exited }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent } })
  if (!response.ok) throw new Error(`Не удалось получить метаданные загрузчика (${response.status}).`)
  return response.json() as Promise<T>
}

export async function availableLoaders(gameVersion: string): Promise<LoaderChoice[]> {
  if (!/^\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?$/.test(gameVersion)) throw new Error('Некорректная версия Minecraft.')
  const result: LoaderChoice[] = [{ loader: 'Vanilla', version: 'vanilla' }]
  const addLoader = async (loader: 'Fabric' | 'Quilt', baseUrl: string): Promise<LoaderChoice[]> => {
    const entries = await fetchJson<Array<{ loader?: { version?: string }; version?: string; stable?: boolean }>>(`${baseUrl}/${encodeURIComponent(gameVersion)}`)
    const versions = [...new Set(entries.map((entry) => entry.loader?.version ?? entry.version).filter((version): version is string => Boolean(version)))]
    return versions[0] ? [{ loader, version: versions[0] }] : []
  }
  const [fabric, quilt, forge, neoForge] = await Promise.allSettled([
    addLoader('Fabric', 'https://meta.fabricmc.net/v2/versions/loader'),
    addLoader('Quilt', 'https://meta.quiltmc.org/v3/versions/loader'),
    forgeVersions(gameVersion),
    neoForgeVersions(gameVersion),
  ])
  if (fabric.status === 'fulfilled') result.push(...fabric.value)
  if (quilt.status === 'fulfilled') result.push(...quilt.value)
  if (forge.status === 'fulfilled' && forge.value) result.push({ loader: 'Forge', version: forge.value })
  if (neoForge.status === 'fulfilled' && neoForge.value) result.push({ loader: 'NeoForge', version: neoForge.value })
  return result
}

async function forgeVersions(gameVersion: string): Promise<string | null> {
  const response = await fetch('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml', { headers: { 'User-Agent': userAgent } })
  if (!response.ok) return null
  const xml = await response.text()
  const prefix = `${gameVersion}-`
  const matches = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((match) => match[1]).filter((version) => version.startsWith(prefix))
  return matches[matches.length - 1]?.slice(prefix.length) ?? null
}

async function neoForgeVersions(gameVersion: string): Promise<string | null> {
  const response = await fetch('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml', { headers: { 'User-Agent': userAgent } })
  if (!response.ok) return null
  const xml = await response.text()
  const matches = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((match) => match[1])
  const [, minor = '', patch = '0'] = gameVersion.split('.')
  const neoForgePrefix = gameVersion === '1.20.1' ? '47.1.' : `${minor}.${patch}.`
  const compatible = matches.filter((version) => {
    return version.startsWith(neoForgePrefix)
  })
  return compatible[compatible.length - 1] ?? null
}

export async function validateLoader(gameVersion: string, loader: string): Promise<void> {
  if (!['Vanilla', 'Fabric', 'Forge', 'NeoForge', 'Quilt'].includes(loader)) throw new Error('Неизвестный загрузчик Minecraft.')
  if (!(await availableLoaders(gameVersion)).some((choice) => choice.loader === loader)) {
    throw new Error(`${loader} не опубликован для Minecraft ${gameVersion}.`)
  }
}

function safeArchivePath(root: string, relativePath: string): string {
  if (!relativePath || relativePath.includes('\0') || relativePath.startsWith('/') || /^[a-zA-Z]:/.test(relativePath)) {
    throw new Error('Архив содержит недопустимый путь.')
  }
  const normalized = relativePath.replace(/\\/g, '/')
  const segments = normalized.split('/')
  if (segments.some((segment) => segment === '..' || segment === '.')) throw new Error('Архив пытается записать файл вне папки сборки.')
  const destination = path.resolve(root, ...segments)
  const relative = path.relative(root, destination)
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('Архив пытается записать файл вне папки сборки.')
  }
  return destination
}

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: false, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error('Не удалось открыть Modrinth-сборку.'))
      else resolve(zip)
    })
  })
}

async function readZipEntry(zip: yauzl.ZipFile, entry: yauzl.Entry, maxBytes: number): Promise<Buffer> {
  if (entry.uncompressedSize > maxBytes) throw new Error('Файл внутри Modrinth-сборки слишком большой.')
  const stream = await zip.openReadStreamPromise(entry)
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of stream) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += data.length
    if (size > maxBytes) throw new Error('Файл внутри Modrinth-сборки слишком большой.')
    chunks.push(data)
  }
  return Buffer.concat(chunks)
}

type MrpackIndex = {
  formatVersion: number
  game: string
  files: Array<{
    path: string
    hashes: { sha1?: string }
    env?: { client?: 'required' | 'optional' | 'unsupported' }
    downloads: string[]
    fileSize: number
  }>
  dependencies: { minecraft?: string; [loader: string]: string | undefined }
}

async function downloadPackFile(url: string, destination: string, expectedSize: number, expectedSha1: string, onProgress?: ProgressCallback, progressState?: { completed: number; total: number }): Promise<void> {
  if (await fs.stat(destination).then(async (stat) => stat.isFile() && stat.size === expectedSize && await fileSha1(destination) === expectedSha1.toLowerCase()).catch(() => false)) {
    if (progressState) {
      progressState.completed += expectedSize
      onProgress?.({ phase: 'downloading', file: path.basename(destination), downloadedBytes: Math.min(progressState.completed, progressState.total), totalBytes: progressState.total })
    }
    return
  }
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname ||
      parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost') || parsed.hostname.endsWith('.local') ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(parsed.hostname) || parsed.hostname.startsWith('[')) {
    throw new Error('Modrinth-сборка содержит небезопасную ссылку на файл.')
  }
  const response = await fetch(parsed, { headers: { 'User-Agent': userAgent } })
  if (!response.ok || !response.body) throw new Error(`Не удалось скачать файл сборки (${response.status}).`)
  const temporary = `${destination}.${randomUUID()}.download`
  const hash = createHash('sha1')
  let bytes = 0
  const transform = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length
      if (bytes > expectedSize || bytes > maximumPackBytes) {
        callback(new Error('Скачанный файл превышает размер, указанный в манифесте.'))
        return
      }
      hash.update(chunk)
      if (progressState) {
        progressState.completed += chunk.length
        onProgress?.({ phase: 'downloading', file: path.basename(destination), downloadedBytes: Math.min(progressState.completed, progressState.total), totalBytes: progressState.total })
      }
      callback(null, chunk)
    },
  })
  try {
    const body = response.body
    const source = Readable.from((async function* () {
      const reader = body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) return
          yield Buffer.from(value)
        }
      } finally {
        reader.releaseLock()
      }
    })())
    await pipeline(source, transform, createWriteStream(temporary, { flags: 'wx' }))
    if (bytes !== expectedSize || hash.digest('hex') !== expectedSha1.toLowerCase()) throw new Error('Хэш или размер файла сборки не совпадает.')
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.rename(temporary, destination)
  } catch (error) {
    await fs.rm(temporary, { force: true })
    throw error
  }
}

export async function installMrpack(archivePath: string, instanceDirectory: string, onProgress?: ProgressCallback): Promise<{ minecraftVersion: string; loader: string; loaderVersion: string | null; files: string[] }> {
  const archiveInfo = await fs.stat(archivePath)
  if (archiveInfo.size > maximumPackBytes) throw new Error('Файл Modrinth-сборки превышает 2 ГБ.')
  const zip = await openZip(archivePath)
  const entries = new Map<string, yauzl.Entry>()
  try {
    let count = 0
    for await (const entry of zip.eachEntry()) {
      count += 1
      if (count > maximumPackEntries) throw new Error('В Modrinth-сборке слишком много файлов.')
      if (entry.fileName === 'manifest.json' || entry.fileName === 'modrinth.index.json') {
        entries.set(entry.fileName, entry)
      } else if (!entry.fileName.endsWith('/')) {
        const overridesPrefix = ['overrides/', 'client-overrides/'].find((prefix) => entry.fileName.startsWith(prefix))
        if (overridesPrefix) entries.set(entry.fileName, entry)
      }
    }
  } finally {
    zip.close()
  }
  const indexEntry = entries.get('modrinth.index.json')
  if (!indexEntry) throw new Error('В архиве отсутствует manifest Modrinth (.mrpack).')
  const readZip = await openZip(archivePath)
  let index: MrpackIndex
  try {
    const manifest = await readZipEntry(readZip, indexEntry, 20 * 1024 * 1024)
    index = JSON.parse(manifest.toString('utf8')) as MrpackIndex
  } finally {
    readZip.close()
  }
  if (index.formatVersion !== 1 || index.game !== 'minecraft' || !index.dependencies?.minecraft || !Array.isArray(index.files)) {
    throw new Error('Manifest Modrinth содержит неподдерживаемую или неполную структуру.')
  }

  const filePaths: string[] = []
  let totalBytes = 0
  const downloadable = index.files.filter((file) => file.env?.client !== 'unsupported')
  const progressState = { completed: 0, total: downloadable.reduce((total, file) => total + (file.fileSize || 0), 0) || 1 }
  for (const file of downloadable) {
    if (!file.path || !Array.isArray(file.downloads) || !/^[a-f\d]{40}$/i.test(file.hashes?.sha1 ?? '') ||
        !Number.isSafeInteger(file.fileSize) || file.fileSize < 0 || file.fileSize > maximumPackBytes) {
      throw new Error('Manifest Modrinth содержит некорректные данные файла.')
    }
    totalBytes += file.fileSize
    if (totalBytes > maximumExtractedBytes) throw new Error('Общий размер Modrinth-сборки превышает лимит.')
    const destination = safeArchivePath(instanceDirectory, file.path)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    let downloaded = false
    for (const url of file.downloads) {
      try {
        await downloadPackFile(url, destination, file.fileSize, file.hashes.sha1!, onProgress, progressState)
        downloaded = true
        break
      } catch (error) {
        if (url === file.downloads[file.downloads.length - 1]) {
          throw new Error(`Не удалось скачать файл «${path.basename(file.path)}»: ${error instanceof Error ? error.message : 'ошибка загрузки'}`)
        }
      }
    }
    if (!downloaded) throw new Error(`У файла «${path.basename(file.path)}» нет доступного адреса для скачивания.`)
    filePaths.push(destination)
  }

  const overrides = [
    ...[...entries.keys()].filter((name) => name.startsWith('overrides/')),
    ...[...entries.keys()].filter((name) => name.startsWith('client-overrides/')),
  ]
  const extractionZip = await openZip(archivePath)
  let extracted = 0
  try {
    const wanted = new Set(overrides)
    for await (const entry of extractionZip.eachEntry()) {
      if (!wanted.has(entry.fileName)) continue
      const prefix = entry.fileName.startsWith('client-overrides/') ? 'client-overrides/' : 'overrides/'
      const destination = safeArchivePath(instanceDirectory, entry.fileName.slice(prefix.length))
      if (entry.uncompressedSize > maximumExtractedBytes - extracted) throw new Error('Размер файлов overrides превышает допустимый лимит.')
      await fs.mkdir(path.dirname(destination), { recursive: true })
      const stream = await extractionZip.openReadStreamPromise(entry)
      await fs.rm(destination, { force: true })
      await pipeline(stream, createWriteStream(destination, { flags: 'wx' }))
      extracted += entry.uncompressedSize
      filePaths.push(destination)
    }
  } finally {
    extractionZip.close()
  }
  const loaders: Record<string, string> = {
    fabric: 'Fabric',
    'fabric-loader': 'Fabric',
    forge: 'Forge',
    neoforge: 'NeoForge',
    quilt: 'Quilt',
    'quilt-loader': 'Quilt',
  }
  const dependencyEntries = Object.entries(index.dependencies)
  const loaderEntries = dependencyEntries.filter(([key]) => key.toLowerCase() in loaders)
  const unknownDependencies = dependencyEntries.filter(([key]) => key.toLowerCase() !== 'minecraft' && !(key.toLowerCase() in loaders))
  if (unknownDependencies.length) throw new Error(`В Modrinth-сборке указан неподдерживаемый загрузчик: ${unknownDependencies[0][0]}.`)
  if (loaderEntries.length > 1) throw new Error('Manifest Modrinth указывает несколько загрузчиков Minecraft.')
  const loaderEntry = loaderEntries[0]
  const loader = loaderEntry ? loaders[loaderEntry[0].toLowerCase()] : 'Vanilla'
  return { minecraftVersion: index.dependencies.minecraft, loader, loaderVersion: loaderEntry?.[1] ?? null, files: filePaths }
}

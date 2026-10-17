import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { createReadStream } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import { availableLoaders, buildLaunchCommand, createOfflineSession, installLoaderProfile, installMojangJavaRuntime, installMrpack, installVanillaVersion, launchMinecraft, readInstanceManifest, requiredJavaMajor, resolveJavaExecutable, validateLoader, type InstallProgress } from './installation'
import { DiscordRpcClient } from './discord-rpc'

type LauncherSettings = {
  instancesPath: string
  playerName: string
  accountType: 'local' | 'nexium'
  glassStrength: number
  showSnapshots: boolean
  showModified: boolean
  showOldReleases: boolean
  showBetas: boolean
  showAlphas: boolean
  useLauncherLanguage: boolean
  minecraftLanguage: string
  javaPath: string
  memoryMb: number
  minecraftArguments: string
  developerConsole: 'off' | 'shared'
  connectionQuality: 'good' | 'normal' | 'poor'
  launchBehavior: 'hide' | 'close' | 'keep'
  launcherLanguage: 'ru' | 'en'
  discordRpc: boolean
  backgroundPath: string
  backgroundKind: 'image' | 'video'
  displayName: string
  profileBio: string
  profileAvatar: string
  profileBadges: Array<'trusted-creator' | 'developer' | 'official'>
}

type InstanceKind = 'game' | 'modpack'

type InstanceRecord = {
  id: string
  name: string
  directoryName: string
  minecraftVersion: string
  loader: string
  /** Итоговый id версии для запуска (для loader-профиля — его собственный id). */
  versionId: string | null
  createdAt: string
  lastPlayedAt: string | null
  favorite: boolean
  filesInstalled: boolean
  kind: InstanceKind
  sourceProjectId: string | null
}

type MinecraftVersionType = 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
const instanceInstallJobs = new Map<string, Promise<InstanceRecord>>()
let mainWindow: BrowserWindow | null = null
const discordRpc = new DiscordRpcClient()
let discordLauncherPresence = {
  details: 'Смотрит вкладку Главная',
  state: 'Minecraft',
  largeImage: 'nexium_logo',
  projectId: '',
}
let activeGamePresence: { details: string; state: string; largeImage: string; startTimestamp: number } | null = null
const projectImageKeys = new Map<string, Promise<string | null>>()

function refreshDiscordPresence() {
  if (activeGamePresence) discordRpc.setPresence(activeGamePresence)
  else discordRpc.setPresence(discordLauncherPresence)
}

function modrinthImageKey(urlValue: unknown): string | null {
  if (typeof urlValue !== 'string') return null
  let url: URL
  try {
    url = new URL(urlValue)
  } catch (error) {
    if (error instanceof TypeError) return null
    throw error
  }
  if (url.protocol !== 'https:' || url.hostname !== 'cdn.modrinth.com') return null
  return url.href
}

function projectImageKey(projectId: string): Promise<string | null> {
  const cached = projectImageKeys.get(projectId)
  if (cached) return cached
  const lookup = fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}`, {
    headers: { 'User-Agent': 'NEXIUM-Launcher/0.1.0 (desktop app)' },
  }).then(async (response) => {
    if (!response.ok) return null
    const project = await response.json() as { icon_url?: string }
    return modrinthImageKey(project.icon_url)
  }).catch(() => null)
  projectImageKeys.set(projectId, lookup)
  return lookup
}

function updateModpackPresenceImage(projectId: string, presence: { largeImage: string }) {
  void projectImageKey(projectId).then((imageKey) => {
    if (!imageKey) return
    if (activeGamePresence === presence) {
      presence.largeImage = imageKey
      refreshDiscordPresence()
    } else if (!activeGamePresence && discordLauncherPresence.projectId === projectId) {
      discordLauncherPresence.largeImage = imageKey
      refreshDiscordPresence()
    }
  })
}
function normalizeLoader(value: string): string {
  const canonical: Record<string, string> = { vanilla: 'Vanilla', fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt' }
  return canonical[value.trim().toLowerCase()] ?? value
}

function reportProgress(sender: Electron.WebContents, instanceId: string, progress: InstallProgress) {
  sender.send('launcher:install-progress', { instanceId, ...progress })
}

async function sha1File(filePath: string): Promise<string> {
  const hash = createHash('sha1')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

const defaultSettings = (): LauncherSettings => ({
  instancesPath: path.join(app.getPath('appData'), 'NEXIUM', 'Instances'),
  playerName: 'Player',
  accountType: 'local',
  glassStrength: 58,
  showSnapshots: false,
  showModified: true,
  showOldReleases: false,
  showBetas: false,
  showAlphas: false,
  useLauncherLanguage: true,
  minecraftLanguage: 'ru_RU',
  javaPath: '',
  memoryMb: Math.max(512, Math.floor(os.totalmem() / 1024 / 1024 / 2 / 512) * 512),
  minecraftArguments: '',
  developerConsole: 'off',
  connectionQuality: 'good',
  launchBehavior: 'hide',
  launcherLanguage: 'ru',
  discordRpc: false,
  backgroundPath: '',
  backgroundKind: 'image',
  displayName: '',
  profileBio: '',
  profileAvatar: '',
  profileBadges: [],
})

app.setName('NEXIUM')
const nexiumRoot = path.join(app.getPath('appData'), 'NEXIUM')
const previousUserDataPath = nexiumRoot
const launcherDataPath = path.join(app.getPath('appData'), 'NEXIUM Launcher')
app.setPath('userData', launcherDataPath)
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json')
const clampPercent = (value: unknown, fallback: number) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : fallback
}

function safeFolderName(value: string) {
  const safe = value.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').slice(0, 70)
  if (!safe || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe)) {
    throw new Error('Название сборки нельзя использовать как имя папки Windows.')
  }
  return safe
}

async function uniqueDirectoryName(baseName: string, currentName?: string) {
  const settings = await loadSettings()
  let name = baseName
  let suffix = 2
  while (name !== currentName) {
    let exists = true
    try {
      await fs.stat(path.join(settings.instancesPath, name))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      exists = false
    }
    if (!exists) break
    name = `${baseName} (${suffix++})`
  }
  return name
}

async function loadSettings(): Promise<LauncherSettings> {
  const defaults = defaultSettings()
  let installerLanguage: 'ru' | 'en' = 'ru'
  try {
    const selectedLanguage = (await fs.readFile(path.join(app.getPath('appData'), 'NEXIUM Launcher', 'installer-language.txt'), 'utf8')).trim()
    if (selectedLanguage === 'ru' || selectedLanguage === 'en') installerLanguage = selectedLanguage
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  try {
    let rawSettings: string
    try {
      rawSettings = await fs.readFile(settingsPath(), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      rawSettings = await fs.readFile(path.join(previousUserDataPath, 'settings.json'), 'utf8')
      await fs.mkdir(path.dirname(settingsPath()), { recursive: true })
      await fs.writeFile(settingsPath(), rawSettings, 'utf8')
    }
    const stored = JSON.parse(rawSettings) as Partial<LauncherSettings>
    const storedInstancesPath = stored.instancesPath
    const legacyInstancesPath = path.join(app.getPath('documents'), 'NEXIUM', 'Instances')
    const previousDefaultPath = previousUserDataPath
    const merged = {
      ...defaults,
      ...stored,
    }
    return {
      ...merged,
      instancesPath: storedInstancesPath === legacyInstancesPath || storedInstancesPath === previousDefaultPath ? defaults.instancesPath : merged.instancesPath,
      glassStrength: clampPercent(stored.glassStrength, defaults.glassStrength),
      memoryMb: Math.min(65536, Math.max(512, Number(stored.memoryMb) || defaults.memoryMb)),
      accountType: stored.accountType === 'nexium' ? 'nexium' : 'local',
      developerConsole: stored.developerConsole === 'shared' ? 'shared' : 'off',
      connectionQuality: stored.connectionQuality === 'normal' || stored.connectionQuality === 'poor' ? stored.connectionQuality : 'good',
      launchBehavior: stored.launchBehavior === 'close' || stored.launchBehavior === 'keep' ? stored.launchBehavior : 'hide',
      launcherLanguage: stored.launcherLanguage === 'ru' || stored.launcherLanguage === 'en' ? stored.launcherLanguage : installerLanguage,
      displayName: typeof stored.displayName === 'string' ? stored.displayName.slice(0, 32) : '',
      profileBio: typeof stored.profileBio === 'string' ? stored.profileBio.slice(0, 280) : '',
      profileAvatar: typeof stored.profileAvatar === 'string' ? stored.profileAvatar : '',
      profileBadges: Array.isArray(stored.profileBadges) ? [...new Set(stored.profileBadges.filter((badge): badge is 'trusted-creator' | 'developer' | 'official' => badge === 'trusted-creator' || badge === 'developer' || badge === 'official'))] : [],
      backgroundKind: stored.backgroundKind === 'video' ? 'video' : 'image',
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return { ...defaults, launcherLanguage: installerLanguage }
  }
}

async function saveSettings(settings: LauncherSettings) {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true })
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
  discordRpc.setEnabled(settings.discordRpc)
  return settings
}

ipcMain.on('launcher:discord-presence', (_event, input: { page?: string; state?: string; largeImage?: string; projectId?: string }) => {
  if (!input || typeof input.page !== 'string') return
  discordLauncherPresence = {
    details: input.page.slice(0, 128),
    state: typeof input.state === 'string' ? input.state.slice(0, 128) : '',
    largeImage: modrinthImageKey(input.largeImage) ??
      (typeof input.largeImage === 'string' && /^[a-zA-Z0-9_]{1,32}$/.test(input.largeImage) ? input.largeImage : 'nexium_logo'),
    projectId: typeof input.projectId === 'string' && /^[\w-]{1,64}$/.test(input.projectId) ? input.projectId : '',
  }
  refreshDiscordPresence()
  if (discordLauncherPresence.projectId) updateModpackPresenceImage(discordLauncherPresence.projectId, discordLauncherPresence)
})

async function listInstances(settings: LauncherSettings): Promise<InstanceRecord[]> {
  await fs.mkdir(settings.instancesPath, { recursive: true })
  const entries = await fs.readdir(settings.instancesPath, { withFileTypes: true })
  const records = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      try {
        const file = path.join(settings.instancesPath, entry.name, 'nexium-instance.json')
        const record = JSON.parse(await fs.readFile(file, 'utf8')) as Partial<InstanceRecord> & Pick<InstanceRecord, 'id' | 'name' | 'minecraftVersion' | 'loader' | 'createdAt'>
        return {
          ...record,
          directoryName: record.directoryName || entry.name,
          versionId: record.versionId ?? null,
          lastPlayedAt: record.lastPlayedAt ?? null,
          favorite: Boolean(record.favorite),
          filesInstalled: Boolean(record.filesInstalled),
          kind: record.kind === 'modpack' ? 'modpack' : 'game',
          sourceProjectId: typeof record.sourceProjectId === 'string' ? record.sourceProjectId : null,
        } satisfies InstanceRecord
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        return undefined
      }
    }))
  return records.filter((record): record is InstanceRecord => record !== undefined)
}

function createWindow() {
  const window = new BrowserWindow({
    title: 'NEXIUM',
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.ico')
      : path.join(app.getAppPath(), 'build', 'icon.ico'),
    width: 1440,
    height: 900,
    minWidth: 1060,
    minHeight: 700,
    backgroundColor: '#101313',
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void window.loadFile(path.join(__dirname, '../../dist/index.html'))
  }
  mainWindow = window
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })
  return window
}

ipcMain.handle('launcher:bootstrap', async () => {
  const settings = await loadSettings()
  await migrateInstanceFolders(settings)
  return {
    settings,
    instances: await listInstances(settings),
    memoryLimitMb: Math.floor(os.totalmem() / 1024 / 1024),
    launcherPath: path.dirname(app.getPath('exe')),
    minecraftPath: path.dirname(settings.instancesPath),
    homesteadVideoUrl: pathToFileURL(app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'homestead-banner.mp4')
      : path.join(app.getAppPath(), 'dist', 'homestead-banner.mp4')).href,
  }
})

async function migrateInstanceFolders(settings: LauncherSettings) {
  await fs.mkdir(settings.instancesPath, { recursive: true })
  if (path.resolve(settings.instancesPath) !== path.resolve(defaultSettings().instancesPath)) return
  const oldDocumentsInstances = path.join(app.getPath('documents'), 'NEXIUM', 'Instances')
  for (const sourceRoot of [previousUserDataPath, oldDocumentsInstances]) {
    let entries
    try {
      entries = await fs.readdir(sourceRoot, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || ['Launcher', 'Minecraft'].includes(entry.name)) continue
      const source = path.join(sourceRoot, entry.name)
      try {
        await fs.access(path.join(source, 'nexium-instance.json'))
        const destination = await uniqueDirectoryName(safeFolderName(entry.name))
        await fs.rename(source, path.join(settings.instancesPath, destination))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
    }
  }
}

ipcMain.handle('launcher:list-minecraft-versions', async () => {
  const response = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', {
    headers: { 'User-Agent': 'NEXIUM-Launcher/0.1.0 (desktop app)' },
  })
  if (!response.ok) throw new Error(`Не удалось загрузить версии Minecraft (${response.status}).`)
  const manifest = await response.json() as {
    versions: Array<{ id: string; type: MinecraftVersionType; releaseTime: string }>
  }
  return manifest.versions.map(({ id, type, releaseTime }) => ({ id, type, releaseTime }))
})

ipcMain.handle('launcher:list-loaders', async (_event, minecraftVersion: string) => availableLoaders(minecraftVersion))

ipcMain.handle('launcher:save-settings', async (_event, patch: Partial<LauncherSettings>) => {
  const current = await loadSettings()
  const next = { ...current, ...patch }
  if (typeof next.playerName !== 'string' || !/^[A-Za-z0-9_]{3,16}$/.test(next.playerName)) {
    throw new Error('Ник должен содержать 3–16 латинских букв, цифр или знаков подчёркивания.')
  }
  next.glassStrength = clampPercent(next.glassStrength, defaultSettings().glassStrength)
  next.memoryMb = Math.min(Math.floor(os.totalmem() / 1024 / 1024), Math.max(512, Math.round(Number(next.memoryMb) || defaultSettings().memoryMb)))
  next.showSnapshots = Boolean(next.showSnapshots)
  next.showModified = Boolean(next.showModified)
  next.showOldReleases = Boolean(next.showOldReleases)
  next.showBetas = Boolean(next.showBetas)
  next.showAlphas = Boolean(next.showAlphas)
  next.useLauncherLanguage = Boolean(next.useLauncherLanguage)
  next.discordRpc = Boolean(next.discordRpc)
  next.displayName = String(next.displayName ?? '').trim().slice(0, 32)
  next.profileBio = String(next.profileBio ?? '').slice(0, 280)
  next.profileAvatar = String(next.profileAvatar ?? '')
  next.profileBadges = Array.isArray(next.profileBadges)
    ? [...new Set(next.profileBadges.filter((badge): badge is 'trusted-creator' | 'developer' | 'official' => badge === 'trusted-creator' || badge === 'developer' || badge === 'official'))]
    : []
  next.accountType = next.accountType === 'nexium' ? 'nexium' : 'local'
  return saveSettings(next)
})

ipcMain.handle('launcher:choose-instances-folder', async () => {
  const settings = await loadSettings()
  const result = await dialog.showOpenDialog({
    title: settings.launcherLanguage === 'en' ? 'Minecraft game data folder' : 'Папка игровых данных Minecraft',
    defaultPath: path.dirname(settings.instancesPath),
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return { instancesPath: settings.instancesPath, minecraftPath: path.dirname(settings.instancesPath) }
  const minecraftPath = result.filePaths[0]
  const instancesPath = path.join(minecraftPath, 'Instances')
  const next = await saveSettings({ ...settings, instancesPath })
  await fs.mkdir(next.instancesPath, { recursive: true })
  return { instancesPath: next.instancesPath, minecraftPath }
})

ipcMain.handle('launcher:open-instances-folder', async () => {
  const settings = await loadSettings()
  const error = await shell.openPath(settings.instancesPath)
  if (error) throw new Error(error)
})

ipcMain.handle('launcher:create-instance', async (_event, input: { name: string; minecraftVersion: string; loader: string; kind?: InstanceKind; sourceProjectId?: string }) => {
  const settings = await loadSettings()
  const name = input.name.trim()
  const loader = normalizeLoader(input.loader)
  if (!name || name.length > 40 || /[<>:"/\\|?*]/.test(name)) {
    throw new Error('Укажите имя сборки длиной до 40 символов.')
  }
  if (!/^[\w.-]{1,64}$/.test(input.minecraftVersion)) throw new Error('Некорректная версия Minecraft.')
  if (input.kind !== 'modpack') await validateLoader(input.minecraftVersion, loader)
  const existing = (await listInstances(settings)).find((instance) => input.sourceProjectId
    ? instance.kind === 'modpack' && instance.sourceProjectId === input.sourceProjectId
    : instance.kind === 'game' && instance.minecraftVersion === input.minecraftVersion && instance.loader === loader)
  if (existing) return existing
  const directoryName = await uniqueDirectoryName(safeFolderName(name))
  const id = randomUUID()
  const directory = path.join(settings.instancesPath, directoryName)
  await fs.mkdir(directory, { recursive: false })
  const record: InstanceRecord = {
    id,
    name,
    directoryName,
    minecraftVersion: input.minecraftVersion,
    loader,
    versionId: null,
    createdAt: new Date().toISOString(),
    lastPlayedAt: null,
    favorite: false,
    filesInstalled: false,
    kind: input.kind === 'modpack' ? 'modpack' : 'game',
    sourceProjectId: input.sourceProjectId ?? null,
  }
  await fs.writeFile(path.join(directory, 'nexium-instance.json'), JSON.stringify(record, null, 2), 'utf8')
  return record
})

ipcMain.handle('launcher:install-instance', async (event, id: string) => {
  const settings = await loadSettings()
  const record = (await listInstances(settings)).find((instance) => instance.id === id)
  if (!record) throw new Error('Сборка не найдена.')
  if (record.filesInstalled) return record
  const existingJob = instanceInstallJobs.get(id)
  if (existingJob) return existingJob
  const job = (async () => {
    const directory = path.join(settings.instancesPath, record.directoryName)
    reportProgress(event.sender, id, { phase: 'preparing', file: '', downloadedBytes: 0, totalBytes: 1 })
    try {
      const vanillaMetadata = await installVanillaVersion(directory, record.minecraftVersion, (progress) => reportProgress(event.sender, id, progress))
      const profile = await installLoaderProfile(directory, vanillaMetadata, record.minecraftVersion, record.loader, settings.javaPath)
      record.versionId = String(profile.id ?? record.minecraftVersion)
      record.filesInstalled = true
      await fs.writeFile(path.join(directory, 'nexium-instance.json'), JSON.stringify(record, null, 2), 'utf8')
      reportProgress(event.sender, id, { phase: 'complete', file: '', downloadedBytes: 1, totalBytes: 1 })
      return record
    } catch (error) {
      reportProgress(event.sender, id, { phase: 'failed', file: error instanceof Error ? error.message : 'Ошибка установки', downloadedBytes: 0, totalBytes: 1 })
      throw error
    }
  })()
  instanceInstallJobs.set(id, job)
  try {
    return await job
  } finally {
    instanceInstallJobs.delete(id)
  }
})

type LaunchGameInput = { instanceId: string; username?: string; javaPath?: string; memoryMb?: number }

ipcMain.handle('launcher:launch-game', async (event, input: LaunchGameInput) => {
  const settings = await loadSettings()
  const record = (await listInstances(settings)).find((instance) => instance.id === input?.instanceId)
  if (!record) throw new Error('Сборка не найдена.')
  if (!record.filesInstalled) throw new Error('Файлы сборки ещё не установлены.')

  const username = String(input?.username ?? '').trim() || settings.playerName
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
    throw new Error('Ник должен содержать 3–16 латинских букв, цифр или знаков подчёркивания.')
  }
  // Java: приоритет у выбранного пути, иначе автопоиск, а если Java нет — скачиваем официальный runtime Mojang.
  const javaMajor = requiredJavaMajor(record.minecraftVersion)
  const minecraftPath = path.dirname(settings.instancesPath)
  const runtimeRoot = path.join(minecraftPath, 'runtime')
  const configuredJava = String(input?.javaPath ?? '').trim() || settings.javaPath
  let javaPath: string
  try {
    javaPath = await resolveJavaExecutable(javaMajor, configuredJava, { extraRoots: [runtimeRoot] })
  } catch {
    reportProgress(event.sender, record.id, { phase: 'preparing', file: 'Java runtime', downloadedBytes: 0, totalBytes: 1 })
    try {
      javaPath = await installMojangJavaRuntime(minecraftPath, javaMajor, (progress) => reportProgress(event.sender, record.id, progress))
    } finally {
      reportProgress(event.sender, record.id, { phase: 'complete', file: '', downloadedBytes: 1, totalBytes: 1 })
    }
  }
  const memoryMb = Math.min(
    Math.floor(os.totalmem() / 1024 / 1024),
    Math.max(512, Math.round(Number(input?.memoryMb) || settings.memoryMb)),
  )

  const gameDirectory = path.join(settings.instancesPath, record.directoryName || record.id)
  const manifest = await readInstanceManifest(gameDirectory, record)
  const session = createOfflineSession(username)
  const minecraftLanguage = settings.useLauncherLanguage
    ? settings.launcherLanguage === 'ru' ? 'ru_ru' : 'en_us'
    : settings.minecraftLanguage.toLowerCase()
  const optionsPath = path.join(gameDirectory, 'options.txt')
  let optionsText = ''
  try {
    optionsText = await fs.readFile(optionsPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const languageLine = `lang:${minecraftLanguage}`
  const nextOptionsText = /^lang:[^\r\n]*/m.test(optionsText)
    ? optionsText.replace(/^lang:[^\r\n]*/m, languageLine)
    : `${optionsText}${optionsText && !optionsText.endsWith('\n') ? '\n' : ''}${languageLine}\n`
  await fs.writeFile(optionsPath, nextOptionsText, 'utf8')
  const command = buildLaunchCommand(javaPath, manifest, gameDirectory, session, memoryMb, minecraftLanguage)
  // Логи игры уходят в renderer только когда включена общая консоль разработчика.
  const relayLogs = settings.developerConsole === 'shared'
  const logPath = path.join(gameDirectory, 'logs', 'nexium-launcher.log')
  let launchLog = `Instance: ${record.name}\nMinecraft version: ${record.minecraftVersion}\nLoader: ${record.loader}\nProfile: ${manifest.id}\nMain class: ${manifest.mainClass}\nJava: ${javaPath}\nMaximum heap: -Xmx${memoryMb}M\nMinecraft language: ${minecraftLanguage}\n\n`
  let gameExited = false
  const send = (channel: string, payload: unknown) => {
    if (!event.sender.isDestroyed()) event.sender.send(channel, payload)
  }

  const { process: child, spawned } = launchMinecraft(command, {
    onOutput: (chunk) => {
      launchLog = `${launchLog}${chunk}`.slice(-256 * 1024)
      if (relayLogs) send('launcher:game-log', { instanceId: record.id, chunk })
    },
    onExit: (code) => {
      gameExited = true
      activeGamePresence = null
      refreshDiscordPresence()
      if (settings.launchBehavior === 'hide') {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore()
          mainWindow.show()
          mainWindow.focus()
        } else {
          createWindow()
        }
      }
    },
    onClose: (code) => {
      void fs.mkdir(path.dirname(logPath), { recursive: true })
        .then(() => fs.writeFile(logPath, launchLog, 'utf8'))
        .then(() => send('launcher:game-exit', { instanceId: record.id, code, logSaved: true }))
        .catch((error) => {
          console.error('Не удалось сохранить лог Minecraft:', error)
          send('launcher:game-exit', { instanceId: record.id, code, logSaved: false })
        })
    },
    onError: (error) => {
      send('launcher:game-log', { instanceId: record.id, chunk: `\n[launch error] ${error.message}\n` })
    },
  })

  try {
    await spawned
  } catch (error) {
    throw new Error(`Не удалось запустить Minecraft: ${error instanceof Error ? error.message : 'неизвестная ошибка'}.`)
  }

  if (!gameExited) {
    activeGamePresence = {
      details: record.kind === 'modpack' ? record.name : `Minecraft ${record.minecraftVersion}`,
      state: record.kind === 'modpack' ? `Играет в сборку · Minecraft ${record.minecraftVersion}` : `${record.loader} · Minecraft`,
      largeImage: record.kind === 'modpack' ? 'modpack_icon' : 'minecraft_logo',
      startTimestamp: Date.now(),
    }
    const gamePresence = activeGamePresence
    refreshDiscordPresence()
    if (record.kind === 'modpack' && record.sourceProjectId) updateModpackPresenceImage(record.sourceProjectId, gamePresence)
  }

  record.lastPlayedAt = new Date().toISOString()
  await fs.writeFile(path.join(gameDirectory, 'nexium-instance.json'), JSON.stringify(record, null, 2), 'utf8')

  if (settings.launchBehavior === 'hide' && !gameExited) mainWindow?.hide()
  else if (settings.launchBehavior === 'close') {
    // Лаунчер закрывается, но игровой процесс должен продолжить работу самостоятельно.
    child.unref()
    app.quit()
  }

  return { instanceId: record.id, pid: child.pid ?? null, uuid: session.uuid, memoryMb }
})

ipcMain.handle('launcher:open-instance-folder', async (_event, id: string) => {
  const settings = await loadSettings()
  const record = (await listInstances(settings)).find((instance) => instance.id === id)
  if (!record) throw new Error('Сборка не найдена.')
  const folder = path.join(settings.instancesPath, record.directoryName || record.id)
  const error = await shell.openPath(folder)
  if (error) throw new Error(error)
})

ipcMain.handle('launcher:update-instance', async (_event, id: string, patch: Partial<Pick<InstanceRecord, 'name' | 'favorite'>>) => {
  const settings = await loadSettings()
  const record = (await listInstances(settings)).find((instance) => instance.id === id)
  if (!record) throw new Error('Сборка не найдена.')
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name || name.length > 40) throw new Error('Название сборки должно содержать от 1 до 40 символов.')
    const newDirectoryName = await uniqueDirectoryName(safeFolderName(name), record.directoryName)
    if (newDirectoryName !== record.directoryName) {
      await fs.rename(path.join(settings.instancesPath, record.directoryName), path.join(settings.instancesPath, newDirectoryName))
      record.directoryName = newDirectoryName
    }
    record.name = name
  }
  if (patch.favorite !== undefined) record.favorite = patch.favorite
  await fs.writeFile(path.join(settings.instancesPath, record.directoryName, 'nexium-instance.json'), JSON.stringify(record, null, 2), 'utf8')
  return record
})

ipcMain.handle('launcher:remove-instance-files', async (_event, id: string) => {
  const settings = await loadSettings()
  const record = (await listInstances(settings)).find((instance) => instance.id === id)
  if (!record) throw new Error('Сборка не найдена.')
  const folder = path.join(settings.instancesPath, record.directoryName || record.id)
  for (const entry of await fs.readdir(folder)) {
    if (entry === 'nexium-instance.json') continue
    await fs.rm(path.join(folder, entry), { recursive: true, force: true })
  }
  record.filesInstalled = false
  await fs.writeFile(path.join(folder, 'nexium-instance.json'), JSON.stringify(record, null, 2), 'utf8')
})

ipcMain.handle('launcher:remove-instance', async (_event, id: string, deleteFiles: boolean) => {
  const settings = await loadSettings()
  const record = (await listInstances(settings)).find((instance) => instance.id === id)
  if (!record) throw new Error('Сборка не найдена.')
  if (deleteFiles) {
    await fs.rm(path.join(settings.instancesPath, record.directoryName || record.id), { recursive: true, force: true })
  } else {
    await fs.unlink(path.join(settings.instancesPath, record.directoryName || record.id, 'nexium-instance.json'))
  }
})

ipcMain.handle('launcher:choose-java', async () => {
  const settings = await loadSettings()
  const result = await dialog.showOpenDialog({
    title: settings.launcherLanguage === 'en' ? 'Select javaw.exe or java.exe' : 'Выберите javaw.exe или java.exe',
    properties: ['openFile'],
    filters: [{ name: 'Java', extensions: ['exe'] }],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('launcher:choose-background', async () => {
  const settings = await loadSettings()
  const result = await dialog.showOpenDialog({
    title: settings.launcherLanguage === 'en' ? 'Choose a background image' : 'Выберите изображение для фона',
    properties: ['openFile'],
    filters: [{ name: settings.launcherLanguage === 'en' ? 'Images and short videos' : 'Изображения и короткие видео', extensions: ['png', 'jpg', 'jpeg', 'webp', 'mp4'] }],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const extension = path.extname(result.filePaths[0]).toLowerCase()
  const isVideo = extension === '.mp4'
  if (isVideo) {
    const stat = await fs.stat(result.filePaths[0])
    if (stat.size > 100 * 1024 * 1024) throw new Error('Размер видеофона не должен превышать 100 МБ.')
    const data = await fs.readFile(result.filePaths[0])
    const marker = data.indexOf(Buffer.from('mvhd'))
    if (marker < 0) throw new Error('Не удалось прочитать длительность MP4-видео.')
    const version = data[marker + 4]
    const timescale = data.readUInt32BE(marker + 8)
    const duration = version === 1
      ? Number(data.readBigUInt64BE(marker + 16))
      : data.readUInt32BE(marker + 12)
    const seconds = duration / timescale
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 5) {
      throw new Error('Длительность видеофона должна быть не больше 5 секунд.')
    }
  }
  const destination = path.join(app.getPath('userData'), `background${extension}`)
  await fs.copyFile(result.filePaths[0], destination)
  return { path: pathToFileURL(destination).href, kind: isVideo ? 'video' : 'image' }
})

ipcMain.handle('launcher:open-external', async (_event, value: string) => {
  const url = new URL(value)
  if (url.protocol !== 'https:' || !['nexiumlauncher.netlify.app', 't.me'].includes(url.hostname)) {
    throw new Error('Разрешены только официальные ссылки NEXIUM.')
  }
  await shell.openExternal(url.toString())
})

ipcMain.handle('launcher:choose-avatar', async () => {
  const settings = await loadSettings()
  const result = await dialog.showOpenDialog({
    title: settings.launcherLanguage === 'en' ? 'Choose a profile avatar' : 'Выберите аватар профиля',
    properties: ['openFile'],
    filters: [{ name: settings.launcherLanguage === 'en' ? 'Images' : 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  })

  if (result.canceled || !result.filePaths[0]) return null
  const extension = path.extname(result.filePaths[0]).toLowerCase()
  const destination = path.join(app.getPath('userData'), `profile-avatar${extension}`)
  await fs.copyFile(result.filePaths[0], destination)
  return pathToFileURL(destination).href
})

app.whenReady().then(async () => {
  await fs.mkdir(path.join(app.getPath('appData'), 'NEXIUM'), { recursive: true })
  const settings = await loadSettings()
  discordRpc.setEnabled(settings.discordRpc)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

})

app.on('before-quit', () => discordRpc.clearAndDisconnect())

ipcMain.handle('launcher:search-modrinth', async (_event, query: string, projectType: string, offset = 0, sort = 'relevance', gameVersion = '', category = '') => {
  if (!['modpack', 'mod', 'resourcepack', 'shader'].includes(projectType)) throw new Error('Некорректная категория проекта.')
  const facets = [[`project_type:${projectType}`]]
  if (gameVersion) facets.push([`versions:${gameVersion}`])
  if (category) facets.push([`categories:${category}`])
  const url = new URL('https://api.modrinth.com/v2/search')
  url.searchParams.set('query', query.trim())
  url.searchParams.set('facets', JSON.stringify(facets))
  url.searchParams.set('limit', '24')
  url.searchParams.set('offset', String(Math.max(0, offset)))
  url.searchParams.set('index', ['relevance', 'downloads', 'follows', 'updated'].includes(sort) ? sort : 'relevance')
  const response = await fetch(url, {
    headers: { 'User-Agent': 'NEXIUM-Launcher/0.1.0 (desktop app)' },
  })
  if (!response.ok) throw new Error(`Modrinth вернул ошибку ${response.status}.`)
  const result = await response.json() as {
    total_hits: number
    hits: Array<{
      project_id: string
      title: string
      description: string
      icon_url: string | null
      downloads: number
      author: string
      project_type: 'modpack' | 'mod' | 'resourcepack' | 'shader'
      categories: string[]
    }>
  }
  return { hits: result.hits, total_hits: result.total_hits }
})

ipcMain.handle('launcher:get-modrinth-project', async (_event, projectId: string) => {
  if (!/^[\w-]{1,64}$/.test(projectId)) throw new Error('Некорректный идентификатор проекта Modrinth.')
  const headers = { 'User-Agent': 'NEXIUM-Launcher/0.1.0 (desktop app)' }
  const [projectResponse, versionsResponse, membersResponse] = await Promise.all([
    fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}`, { headers }),
    fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version`, { headers }),
    fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/members`, { headers }),
  ])
  if (!projectResponse.ok) throw new Error(`Modrinth не смог загрузить проект (${projectResponse.status}).`)
  if (!versionsResponse.ok) throw new Error(`Modrinth не смог загрузить версии (${versionsResponse.status}).`)
  if (!membersResponse.ok) throw new Error(`Modrinth не смог загрузить автора проекта (${membersResponse.status}).`)

  const project = await projectResponse.json() as {
    id: string
    title: string
    description: string
    body: string
    icon_url: string | null
    downloads: number
    followers: number
    project_type: 'modpack' | 'mod' | 'resourcepack' | 'shader'
    categories: string[]
    updated: string
    gallery: Array<{ url: string; title: string | null; description: string | null }>
  }
  const members = await membersResponse.json() as Array<{ role: string; accepted: boolean; user: { username: string } }>
  const owner = members.find((member) => member.accepted && member.role.toLowerCase() === 'owner')
    ?? members.find((member) => member.accepted)
  const versions = await versionsResponse.json() as Array<{
    id: string
    version_number: string
    name: string | null
    date_published: string
    game_versions: string[]
    loaders: string[]
    downloads: number
    dependencies: Array<{
      version_id: string | null
      project_id: string | null
      file_name: string | null
      dependency_type: string
    }>
    files: Array<{ url: string; filename: string; primary: boolean; size: number; hashes?: { sha1?: string } }>
  }>
  return {
    ...project,
    project_id: project.id,
    author: owner?.user.username ?? 'Участник Modrinth',
    follows: project.followers,
    versions,
  }
})

ipcMain.handle('launcher:download-modrinth-version', async (event, projectId: string, versionId: string, instanceId: string, forceReinstall = false) => {
  if (!/^[\w-]{1,64}$/.test(projectId) || !/^[\w-]{1,64}$/.test(versionId)) throw new Error('Некорректный проект или версия Modrinth.')
  const settings = await loadSettings()
  const record = (await listInstances(settings)).find((instance) => instance.id === instanceId)
  if (!record) throw new Error('Сначала выберите или создайте сборку.')
  const targetRecord = record
  if (!forceReinstall && targetRecord.kind === 'modpack' && targetRecord.sourceProjectId === projectId && targetRecord.filesInstalled) {
    return { downloaded: [], instance: targetRecord, alreadyInstalled: true }
  }
  const headers = { 'User-Agent': 'NEXIUM-Launcher/0.1.0 (desktop app)' }
  const rootProjectType = await projectType(projectId, headers)
  if ((targetRecord.kind === 'modpack') !== (rootProjectType === 'modpack')) {
    throw new Error('Тип проекта не подходит для выбранной папки сборки.')
  }
  const downloaded = new Set<string>()
  const paths: string[] = []
  let importedInstance: InstanceRecord | undefined
  const report = (progress: InstallProgress) => reportProgress(event.sender, instanceId, progress)

  async function downloadVersion(expectedProjectId: string | null, currentVersionId: string, depth: number): Promise<void> {
    const key = `${expectedProjectId ?? ''}:${currentVersionId}`
    if (downloaded.has(key)) return
    if (depth > 8) throw new Error('Слишком много вложенных зависимостей.')
    downloaded.add(key)
    const response = await fetch(`https://api.modrinth.com/v2/version/${encodeURIComponent(currentVersionId)}`, { headers })
    if (!response.ok) throw new Error(`Не удалось получить версию проекта (${response.status}).`)
    const version = await response.json() as {
      project_id: string
      game_versions: string[]
      loaders: string[]
      dependencies: Array<{ project_id: string | null; version_id: string | null; dependency_type: string }>
      files: Array<{ url: string; filename: string; primary: boolean; size: number; hashes?: { sha1?: string } }>
    }
    if (expectedProjectId && version.project_id !== expectedProjectId) throw new Error('Версия Modrinth не соответствует выбранному проекту.')
    const contentType = await projectType(version.project_id, headers)
    if (depth === 0 && !version.game_versions.includes(targetRecord.minecraftVersion)) {
      throw new Error(`Версия проекта не поддерживает Minecraft ${targetRecord.minecraftVersion}.`)
    }
    if (depth === 0 && contentType === 'mod' && targetRecord.loader !== 'Vanilla' &&
        !version.loaders.some((loader) => loader.toLowerCase() === targetRecord.loader.toLowerCase())) {
      throw new Error(`Версия проекта не поддерживает загрузчик ${targetRecord.loader}.`)
    }
    if (depth === 0 && contentType === 'mod' && targetRecord.loader === 'Vanilla') {
      throw new Error('Моды нужно устанавливать в сборку с Fabric, Forge или другим загрузчиком.')
    }
    const folderByType = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks', modpack: 'modpacks' } as const
    const folder = path.join(settings.instancesPath, targetRecord.directoryName, folderByType[contentType])

    if (targetRecord.kind !== 'modpack') {
      for (const dependency of version.dependencies.filter((item) => item.dependency_type === 'required')) {
        let dependencyVersionId = dependency.version_id
        if (!dependencyVersionId && dependency.project_id) {
          const dependencyVersionsUrl = new URL(`https://api.modrinth.com/v2/project/${encodeURIComponent(dependency.project_id)}/version`)
          dependencyVersionsUrl.searchParams.set('game_versions', JSON.stringify(version.game_versions))
          if (version.loaders.length) dependencyVersionsUrl.searchParams.set('loaders', JSON.stringify(version.loaders))
          const dependencyResponse = await fetch(dependencyVersionsUrl, { headers })
          if (!dependencyResponse.ok) throw new Error(`Не удалось проверить обязательную зависимость (${dependencyResponse.status}).`)
          const compatible = await dependencyResponse.json() as Array<{ id: string }>
          dependencyVersionId = compatible[0]?.id ?? null
        }
        if (!dependencyVersionId) {
          throw new Error(`Не найдена совместимая обязательная зависимость ${dependency.project_id ?? ''}.`)
        }
        await downloadVersion(dependency.project_id, dependencyVersionId, depth + 1)
      }
    }

    const file = version.files.find((item) => item.primary) ?? version.files[0]
    if (!file) throw new Error('У этой версии нет доступного файла для загрузки.')
    if (file.size > 2 * 1024 * 1024 * 1024) throw new Error('Файл превышает допустимый размер 2 ГБ.')
    const fileUrl = new URL(file.url)
    if (fileUrl.protocol !== 'https:' || fileUrl.hostname !== 'cdn.modrinth.com') throw new Error('Modrinth вернул недопустимый адрес файла.')
    if (contentType === 'modpack') {
      if (targetRecord.kind === 'modpack' && targetRecord.sourceProjectId === projectId && targetRecord.filesInstalled) {
        importedInstance = targetRecord
        return
      }
      const archiveDirectory = path.join(settings.instancesPath, targetRecord.directoryName, '.downloads')
      await fs.mkdir(archiveDirectory, { recursive: true })
      const archivePath = path.join(archiveDirectory, `${randomUUID()}.mrpack`)
      const archiveResponse = await fetch(fileUrl, { headers })
      if (!archiveResponse.ok || !archiveResponse.body) throw new Error(`Не удалось скачать архив сборки (${archiveResponse.status}).`)
      const archiveHandle = await fs.open(archivePath, 'wx')
      let archiveSize = 0
      const archiveHash = createHash('sha1')
      try {
        const reader = archiveResponse.body.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          archiveSize += value.byteLength
          if (archiveSize > 2 * 1024 * 1024 * 1024) throw new Error('Файл превышает допустимый размер 2 ГБ.')
          archiveHash.update(value)
          report({ phase: 'downloading', file: path.basename(archivePath), downloadedBytes: archiveSize, totalBytes: file.size || 0 })
          let offset = 0
          while (offset < value.byteLength) {
            const { bytesWritten } = await archiveHandle.write(value, offset)
            if (!bytesWritten) throw new Error('Не удалось записать архив сборки на диск.')
            offset += bytesWritten
          }
        }
      } catch (error) {
        await archiveHandle.close()
        await fs.rm(archivePath, { force: true })
        throw error
      }
      await archiveHandle.close()
      if (file.size > 0 && archiveSize !== file.size) {
        await fs.rm(archivePath, { force: true })
        throw new Error('Скачанный архив сборки неполный.')
      }
      if (file.hashes?.sha1 && archiveHash.digest('hex') !== file.hashes.sha1.toLowerCase()) {
        await fs.rm(archivePath, { force: true })
        throw new Error('Хэш архива Modrinth-сборки не совпадает.')
      }
      try {
        const installed = await installMrpack(archivePath, path.join(settings.instancesPath, targetRecord.directoryName), report)
        await validateLoader(installed.minecraftVersion, installed.loader)
        const vanillaMetadata = await installVanillaVersion(path.join(settings.instancesPath, targetRecord.directoryName), installed.minecraftVersion, report)
        const profile = await installLoaderProfile(path.join(settings.instancesPath, targetRecord.directoryName), vanillaMetadata, installed.minecraftVersion, installed.loader, settings.javaPath, installed.loaderVersion ?? undefined)
        targetRecord.minecraftVersion = installed.minecraftVersion
        targetRecord.loader = installed.loader
        targetRecord.versionId = String(profile.id ?? installed.minecraftVersion)
        targetRecord.filesInstalled = true
        await fs.writeFile(path.join(settings.instancesPath, targetRecord.directoryName, 'nexium-instance.json'), JSON.stringify(targetRecord, null, 2), 'utf8')
        paths.push(...installed.files)
      } finally {
        await fs.rm(archiveDirectory, { recursive: true, force: true })
      }
      importedInstance = targetRecord
      return
    }
    await fs.mkdir(folder, { recursive: true })
    const safeName = path.basename(file.filename).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    const destination = path.join(folder, safeName)
    if (file.hashes?.sha1 && await fs.stat(destination).then(async (stat) => stat.isFile() && stat.size === file.size && await sha1File(destination) === file.hashes?.sha1?.toLowerCase()).catch(() => false)) {
      report({ phase: 'downloading', file: safeName, downloadedBytes: file.size, totalBytes: file.size })
      paths.push(destination)
      return
    }
    const fileResponse = await fetch(fileUrl, { headers })
    if (!fileResponse.ok) throw new Error(`Не удалось скачать файл (${fileResponse.status}).`)
    const temporary = `${destination}.${randomUUID()}.download`
    const fileHandle = await fs.open(temporary, 'w')
    let totalBytes = 0
    const sha1 = createHash('sha1')
    let fileClosed = false
    try {
      const reader = fileResponse.body?.getReader()
      if (!reader) throw new Error('Modrinth не передал содержимое файла.')
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        totalBytes += value.byteLength
        if (totalBytes > 2 * 1024 * 1024 * 1024) throw new Error('Файл превышает допустимый размер 2 ГБ.')
        sha1.update(value)
        report({ phase: 'downloading', file: safeName, downloadedBytes: totalBytes, totalBytes: file.size || 0 })
        let offset = 0
        while (offset < value.byteLength) {
          const { bytesWritten } = await fileHandle.write(value, offset)
          if (!bytesWritten) throw new Error('Не удалось записать скачанный файл на диск.')
          offset += bytesWritten
        }
      }
      if (file.size > 0 && totalBytes !== file.size) throw new Error('Скачанный файл неполный.')
      if (file.hashes?.sha1 && sha1.digest('hex') !== file.hashes.sha1.toLowerCase()) throw new Error('Хэш скачанного файла Modrinth не совпадает.')
      await fileHandle.close()
      fileClosed = true
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.rm(destination, { force: true })
      await fs.stat(temporary)
      await fs.rename(temporary, destination)
    } catch (error) {
      if (!fileClosed) await fileHandle.close()
      await fs.rm(temporary, { force: true })
      throw error
    }
    paths.push(destination)
  }

  await downloadVersion(projectId, versionId, 0)
  report({ phase: 'complete', file: '', downloadedBytes: 1, totalBytes: 1 })
  return { downloaded: paths, ...(importedInstance ? { instance: importedInstance } : {}) }
})

async function projectType(projectId: string, headers: Record<string, string>): Promise<'mod' | 'resourcepack' | 'shader' | 'modpack'> {
  const response = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}`, { headers })
  if (!response.ok) throw new Error(`Не удалось определить категорию зависимости (${response.status}).`)
  const project = await response.json() as { project_type: string }
  if (!['mod', 'resourcepack', 'shader', 'modpack'].includes(project.project_type)) throw new Error('Неизвестный тип зависимости Modrinth.')
  if (project.project_type === 'mod' || project.project_type === 'resourcepack' || project.project_type === 'shader' || project.project_type === 'modpack') return project.project_type
  throw new Error('Неизвестный тип зависимости Modrinth.')
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

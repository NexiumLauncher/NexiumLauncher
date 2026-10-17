export type LauncherSettings = {
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
  profileBadges: VerificationBadge[]
}

export type VerificationBadge = 'trusted-creator' | 'developer' | 'official'

export type InstanceRecord = {
  id: string
  name: string
  directoryName: string
  minecraftVersion: string
  loader: string
  versionId?: string | null
  createdAt: string
  lastPlayedAt: string | null
  favorite: boolean
  filesInstalled: boolean
  kind: 'game' | 'modpack'
  sourceProjectId: string | null
}

export type ModrinthProject = {
  project_id: string
  project_type: 'modpack' | 'mod' | 'resourcepack' | 'shader'
  title: string
  description: string
  icon_url: string | null
  downloads: number
  author: string
  categories: string[]
}

export type ModrinthProjectDetails = ModrinthProject & {
  body: string
  follows: number
  updated: string
  gallery: Array<{ url: string; title: string | null; description: string | null }>
  versions: Array<{
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
    files: Array<{ url: string; filename: string; primary: boolean; size: number }>
  }>
}

export type MinecraftVersion = {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  releaseTime: string
}

export type LoaderChoice = {
  loader: 'Vanilla' | 'Fabric' | 'Forge' | 'NeoForge' | 'Quilt'
  version: string
}

export type InstallProgress = {
  instanceId: string
  phase: 'preparing' | 'downloading' | 'complete' | 'failed'
  file: string
  downloadedBytes: number
  totalBytes: number
}

declare global {
  interface Window {
    nexium: {
      bootstrap(): Promise<{ settings: LauncherSettings; instances: InstanceRecord[]; memoryLimitMb: number; launcherPath: string; minecraftPath: string; homesteadVideoUrl: string }>
      setDiscordPresence(input: { page: string; state?: string; largeImage?: string; projectId?: string }): void
      listMinecraftVersions(): Promise<MinecraftVersion[]>
      listLoaders(minecraftVersion: string): Promise<LoaderChoice[]>
      openInstancesFolder(): Promise<void>
      saveSettings(patch: Partial<LauncherSettings>): Promise<LauncherSettings>
      chooseInstancesFolder(): Promise<{ instancesPath: string; minecraftPath: string }>
      createInstance(input: Pick<InstanceRecord, 'name' | 'minecraftVersion' | 'loader'> & Partial<Pick<InstanceRecord, 'kind' | 'sourceProjectId'>>): Promise<InstanceRecord>
      installInstance(id: string): Promise<InstanceRecord>
      launchGame(input: { instanceId: string; username?: string; javaPath?: string; memoryMb?: number }): Promise<{ instanceId: string; pid: number | null; uuid: string; memoryMb: number }>
      onGameExit(listener: (payload: { instanceId: string; code: number | null; logSaved: boolean }) => void): () => void
      onGameLog(listener: (payload: { instanceId: string; chunk: string }) => void): () => void
      onInstallProgress(listener: (progress: InstallProgress) => void): () => void
      openInstanceFolder(id: string): Promise<void>
      updateInstance(id: string, patch: Partial<Pick<InstanceRecord, 'name' | 'favorite'>>): Promise<InstanceRecord>
      removeInstanceFiles(id: string): Promise<void>
      removeInstance(id: string, deleteFiles: boolean): Promise<void>
      searchModrinth(query: string, projectType: string, offset?: number, sort?: string, gameVersion?: string, category?: string): Promise<{ hits: ModrinthProject[]; total_hits: number }>
      getModrinthProject(projectId: string): Promise<ModrinthProjectDetails>
      downloadModrinthVersion(projectId: string, versionId: string, instanceId: string, forceReinstall?: boolean): Promise<{ downloaded: string[]; instance?: InstanceRecord; alreadyInstalled?: boolean }>
      chooseJava(): Promise<string | null>
      chooseBackground(): Promise<{ path: string; kind: 'image' | 'video' } | null>
      chooseAvatar(): Promise<string | null>
      openExternal(url: string): Promise<void>
    }
  }
}

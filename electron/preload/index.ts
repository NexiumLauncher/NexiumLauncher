import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('nexium', {
  bootstrap: () => ipcRenderer.invoke('launcher:bootstrap'),
  setDiscordPresence: (input: { page: string; state?: string; largeImage?: string; projectId?: string }) =>
    ipcRenderer.send('launcher:discord-presence', input),
  listMinecraftVersions: () => ipcRenderer.invoke('launcher:list-minecraft-versions'),
  listLoaders: (minecraftVersion: string) => ipcRenderer.invoke('launcher:list-loaders', minecraftVersion),
  openInstancesFolder: () => ipcRenderer.invoke('launcher:open-instances-folder'),
  saveSettings: (patch: Record<string, string | number>) => ipcRenderer.invoke('launcher:save-settings', patch),
  chooseInstancesFolder: () => ipcRenderer.invoke('launcher:choose-instances-folder'),
  createInstance: (input: { name: string; minecraftVersion: string; loader: string; kind?: 'game' | 'modpack'; sourceProjectId?: string }) =>
    ipcRenderer.invoke('launcher:create-instance', input),
  installInstance: (id: string) => ipcRenderer.invoke('launcher:install-instance', id),
  launchGame: (input: { instanceId: string; username?: string; javaPath?: string; memoryMb?: number }) =>
    ipcRenderer.invoke('launcher:launch-game', input),
  onGameExit: (listener: (payload: { instanceId: string; code: number | null; logSaved: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { instanceId: string; code: number | null; logSaved: boolean }) => listener(payload)
    ipcRenderer.on('launcher:game-exit', handler)
    return () => ipcRenderer.removeListener('launcher:game-exit', handler)
  },
  onGameLog: (listener: (payload: { instanceId: string; chunk: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { instanceId: string; chunk: string }) => listener(payload)
    ipcRenderer.on('launcher:game-log', handler)
    return () => ipcRenderer.removeListener('launcher:game-log', handler)
  },
  onInstallProgress: (listener: (progress: { instanceId: string; phase: string; file: string; downloadedBytes: number; totalBytes: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: { instanceId: string; phase: string; file: string; downloadedBytes: number; totalBytes: number }) => listener(progress)
    ipcRenderer.on('launcher:install-progress', handler)
    return () => ipcRenderer.removeListener('launcher:install-progress', handler)
  },
  openInstanceFolder: (id: string) => ipcRenderer.invoke('launcher:open-instance-folder', id),
  updateInstance: (id: string, patch: { name?: string; favorite?: boolean }) =>
    ipcRenderer.invoke('launcher:update-instance', id, patch),
  removeInstanceFiles: (id: string) => ipcRenderer.invoke('launcher:remove-instance-files', id),
  removeInstance: (id: string, deleteFiles: boolean) =>
    ipcRenderer.invoke('launcher:remove-instance', id, deleteFiles),
  searchModrinth: (query: string, projectType: string, offset?: number, sort?: string, gameVersion?: string, category?: string) =>
    ipcRenderer.invoke('launcher:search-modrinth', query, projectType, offset, sort, gameVersion, category),
  getModrinthProject: (projectId: string) =>
    ipcRenderer.invoke('launcher:get-modrinth-project', projectId),
  downloadModrinthVersion: (projectId: string, versionId: string, instanceId: string, forceReinstall?: boolean) =>
    ipcRenderer.invoke('launcher:download-modrinth-version', projectId, versionId, instanceId, forceReinstall),
  chooseJava: () => ipcRenderer.invoke('launcher:choose-java'),
  chooseBackground: () => ipcRenderer.invoke('launcher:choose-background'),
  chooseAvatar: () => ipcRenderer.invoke('launcher:choose-avatar'),
  openExternal: (url: string) => ipcRenderer.invoke('launcher:open-external', url),
})

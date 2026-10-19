import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('labDesktopAPI', {
  getBackendConfig: () => ipcRenderer.invoke('config:getBackendConfig'),
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),
  openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),
  showItemInFolder: (path: string) => ipcRenderer.invoke('shell:showItemInFolder', path),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
});

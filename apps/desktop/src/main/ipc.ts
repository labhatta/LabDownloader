import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { BackendProcessInfo } from './backend';

export function setupIpcHandlers(
  mainWindow: BrowserWindow,
  getBackendInfo: () => BackendProcessInfo | null
) {
  // Returns backend credentials to renderer preload
  ipcMain.removeHandler('config:getBackendConfig');
  ipcMain.handle('config:getBackendConfig', () => {
    const info = getBackendInfo();
    return {
      port: info?.port || 52174,
      token: info?.token || 'devtoken1234567890abcdef',
      platform: 'desktop',
    };
  });

  // Native folder selection dialog
  ipcMain.removeHandler('dialog:openDirectory');
  ipcMain.handle('dialog:openDirectory', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Download Folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || res.filePaths.length === 0) {
      return null;
    }
    return res.filePaths[0];
  });

  // Native shell open
  ipcMain.removeHandler('shell:openPath');
  ipcMain.handle('shell:openPath', async (_, targetPath: string) => {
    if (!targetPath) return false;
    const err = await shell.openPath(targetPath);
    return err === '';
  });

  // Highlight file in Windows Explorer
  ipcMain.removeHandler('shell:showItemInFolder');
  ipcMain.handle('shell:showItemInFolder', async (_, targetPath: string) => {
    if (!targetPath) return false;
    shell.showItemInFolder(targetPath);
    return true;
  });

  // Window Controls
  ipcMain.removeAllListeners('window:minimize');
  ipcMain.on('window:minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.removeAllListeners('window:maximize');
  ipcMain.on('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.removeAllListeners('window:close');
  ipcMain.on('window:close', () => {
    mainWindow.close();
  });

  ipcMain.removeHandler('window:isMaximized');
  ipcMain.handle('window:isMaximized', () => {
    return mainWindow.isMaximized();
  });
}

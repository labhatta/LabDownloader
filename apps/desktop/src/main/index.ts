import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { BackendProcessInfo, startBackendProcess, stopBackendProcess } from './backend';
import { setupIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;
let backendInfo: BackendProcessInfo | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1140,
    height: 780,
    minWidth: 860,
    minHeight: 620,
    frame: false,
    title: 'LabDownloader',
    backgroundColor: '#FFF6E8',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  setupIpcHandlers(mainWindow, () => backendInfo);

  // Security: Block unexpected external navigation
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Only allow navigating to local dev server or local file
    if (!url.startsWith('http://localhost:5173') && !url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Security: Block unexpected window opens
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    // Load built dist/index.html
    const indexPath = path.resolve(__dirname, '../../dist/index.html');
    await mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    backendInfo = await startBackendProcess();
  } catch (err) {
    console.error('[Electron] Could not start backend:', err);
  }

  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', async () => {
  if (backendInfo) {
    await stopBackendProcess(backendInfo);
    backendInfo = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

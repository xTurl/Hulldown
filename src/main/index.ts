import { app, BrowserWindow, Menu } from 'electron';
import path from 'path';
import started from 'electron-squirrel-startup';
import { registerHandlers } from './ipc/handlers';
import { closeDb } from './services/cache';

if (started) app.quit();

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#030712',
    icon: app.isPackaged
      ? path.join(process.resourcesPath, process.platform === 'win32' ? 'icon.ico' : 'icon.png')
      : path.join(__dirname, process.platform === 'win32' ? '../../assets/icon.ico' : '../../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL && !app.isPackaged) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

app.on('ready', () => {
  Menu.setApplicationMenu(null);
  registerHandlers();
  createWindow();
});

app.on('before-quit', () => {
  closeDb();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

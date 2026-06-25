import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { registerIpcHandlers } from './ipc';

// In E2E mode hide the window so it does not pop up on the user's screen.
// Playwright can still interact with hidden windows via webContents.
const isE2E = !!process.env['E2E_VAULT_PATH'];

// Isolate persisted config (settings.json, sync-etag-cache.json) during E2E so
// tests never read or clobber the user's real app data. Must run before any
// app.getPath('userData') call (store.ts / etagCacheStore.ts compute paths at import).
if (isE2E && process.env['E2E_USER_DATA']) {
  app.setPath('userData', process.env['E2E_USER_DATA']);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 760,
    minHeight: 480,
    backgroundColor: '#09090b', // zinc-950
    titleBarStyle: 'hiddenInset',
    show: !isE2E,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  registerIpcHandlers(win);

  // Open external links in default browser, not inside Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

import { ipcMain, dialog } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC } from '@notes-app/common';
import * as vault from '../vaultManager.js';
import * as settings from '../store.js';

export function registerIpcHandlers(win: BrowserWindow) {
  // ─── Dialog ──────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.DIALOG_OPEN_FOLDER, async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Open vault folder',
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  // ─── Vault ───────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.VAULT_OPEN, async (_event, vaultPath: string) => {
    const notes = await vault.openVault(vaultPath, win);
    await settings.addRecentVault(vaultPath);
    return notes;
  });

  ipcMain.handle(IPC.VAULT_GET_RECENT, async () => {
    return settings.getRecentVaults();
  });

  // ─── File operations ─────────────────────────────────────────────────────
  ipcMain.handle(IPC.FILE_READ, async (_event, relativePath: string) => {
    return vault.readFile(relativePath);
  });

  ipcMain.handle(IPC.FILE_WRITE, async (_event, relativePath: string, content: string) => {
    await vault.writeFile(relativePath, content);
  });

  ipcMain.handle(IPC.FILE_CREATE, async (_event, title: string) => {
    return vault.createFile(title);
  });

  ipcMain.handle(IPC.FILE_RENAME, async (_event, relativePath: string, newTitle: string) => {
    return vault.renameFile(relativePath, newTitle);
  });

  ipcMain.handle(IPC.FILE_DELETE, async (_event, relativePath: string) => {
    await vault.deleteFile(relativePath);
  });

  // ─── Image ───────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.IMAGE_SAVE, async (_event, base64: string, ext: string) => {
    const activeNote = vault.getIndex()?.getAllNotes()[0];
    const activePath = activeNote?.path ?? 'untitled.md';
    return vault.saveImage(base64, ext, activePath);
  });
}

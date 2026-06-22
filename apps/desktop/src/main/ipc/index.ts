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
    const { renamed, propagated } = await vault.renameFile(relativePath, newTitle);
    return { renamed, propagated };
  });

  ipcMain.handle(IPC.FILE_DELETE, async (_event, relativePath: string) => {
    await vault.deleteFile(relativePath);
  });

  // ─── Frontmatter patch ───────────────────────────────────────────────────
  ipcMain.handle(
    IPC.FILE_UPDATE_FRONTMATTER,
    async (
      _event,
      relativePath: string,
      patch: Partial<{ tags: string[]; emoji: string | null }>
    ) => {
      return vault.updateFrontmatter(relativePath, patch);
    }
  );

  // ─── Backlinks ───────────────────────────────────────────────────────────
  ipcMain.handle(IPC.VAULT_GET_BACKLINKS, async (_event, noteId: string) => {
    return vault.getIndex()?.getBacklinks(noteId) ?? [];
  });

  ipcMain.handle(IPC.VAULT_GET_RELATIONSHIP_TYPES, async () => {
    return vault.getIndex()?.getRelationshipTypes() ?? [];
  });

  // ─── Image ───────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.IMAGE_SAVE, async (_event, base64: string, ext: string, activePath: string) => {
    return vault.saveImage(base64, ext, activePath || 'untitled.md');
  });

  // ─── Sync / conflict resolution ──────────────────────────────────────────
  ipcMain.handle(
    IPC.SYNC_RESOLVE_CONFLICT,
    async (_event, notePath: string, conflictFilePath: string, mergedContent: string) => {
      return vault.resolveConflict(notePath, conflictFilePath, mergedContent);
    }
  );

  ipcMain.handle(
    IPC.SYNC_CREATE_CONFLICT_FROM_EXTERNAL,
    async (_event, notePath: string, timestamp: string) => {
      return vault.createConflictFromExternal(notePath, timestamp);
    }
  );

  // ─── Export ──────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.EXPORT_ZIP, async () => {
    return vault.exportZip(win);
  });
}

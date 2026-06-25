import { ipcMain, dialog } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC } from '@notes-app/common';
import type { SyncSettings } from '@notes-app/common';
import * as vault from '../vaultManager.js';
import * as settings from '../store.js';
import * as syncManager from '../syncManager.js';

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

  // ─── Sync — server mode (M7) ──────────────────────────────────────────────
  ipcMain.handle(IPC.SYNC_GET_CONFIG, async () => {
    return settings.getSyncConfig();
  });

  ipcMain.handle(IPC.SYNC_SET_CONFIG, async (_event, config: SyncSettings) => {
    await settings.setSyncConfig(config);
    vault.applySyncConfig(config, win);
  });

  ipcMain.handle(IPC.SYNC_TEST_CONNECTION, async (_event, url: string, token: string) => {
    return syncManager.testConnection(url, token);
  });

  ipcMain.handle(IPC.SYNC_FORCE_SYNC, async () => {
    await syncManager.forceSync();
  });

  // ─── Export ──────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.EXPORT_ZIP, async () => {
    return vault.exportZip(win);
  });

  // ─── Import — Anytype (M8) ────────────────────────────────────────────────
  ipcMain.handle(IPC.IMPORT_ANYTYPE_PICK, async () => {
    // E2E injection: skip the native dialog when a fixture path is provided.
    const injected = process.env['E2E_IMPORT_ZIP'];
    if (injected) return injected;
    const result = await dialog.showOpenDialog(win, {
      title: 'Import from Anytype',
      properties: ['openFile'],
      filters: [{ name: 'Anytype export', extensions: ['zip'] }],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle(IPC.IMPORT_ANYTYPE_PREVIEW, async (_event, filePath: string) => {
    return vault.importAnytypePreview(filePath);
  });

  ipcMain.handle(IPC.IMPORT_ANYTYPE_RUN, async (_event, filePath: string) => {
    return vault.importAnytypeRun(filePath, win);
  });
}

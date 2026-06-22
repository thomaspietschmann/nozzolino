import { IPC } from '@notes-app/common';
import type { NoteRecord } from '@notes-app/common';

export interface RecentVault {
  path: string;
  name: string;
  lastOpened: string;
}

export interface FileChangedEvent {
  event: 'add' | 'change' | 'unlink';
  relativePath: string;
  record?: NoteRecord;
}

export const ipc = {
  openFolder(): Promise<string | null> {
    return window.electronAPI.invoke<string | null>(IPC.DIALOG_OPEN_FOLDER);
  },

  openVault(vaultPath: string): Promise<NoteRecord[]> {
    return window.electronAPI.invoke<NoteRecord[]>(IPC.VAULT_OPEN, vaultPath);
  },

  getRecentVaults(): Promise<RecentVault[]> {
    return window.electronAPI.invoke<RecentVault[]>(IPC.VAULT_GET_RECENT);
  },

  readFile(relativePath: string): Promise<string> {
    return window.electronAPI.invoke<string>(IPC.FILE_READ, relativePath);
  },

  writeFile(relativePath: string, content: string): Promise<void> {
    return window.electronAPI.invoke<void>(IPC.FILE_WRITE, relativePath, content);
  },

  createFile(title: string): Promise<NoteRecord> {
    return window.electronAPI.invoke<NoteRecord>(IPC.FILE_CREATE, title);
  },

  renameFile(relativePath: string, newTitle: string): Promise<{ renamed: NoteRecord; propagated: NoteRecord[] }> {
    return window.electronAPI.invoke<{ renamed: NoteRecord; propagated: NoteRecord[] }>(IPC.FILE_RENAME, relativePath, newTitle);
  },

  deleteFile(relativePath: string): Promise<void> {
    return window.electronAPI.invoke<void>(IPC.FILE_DELETE, relativePath);
  },

  saveImage(base64: string, ext: string, activePath: string): Promise<string> {
    return window.electronAPI.invoke<string>(IPC.IMAGE_SAVE, base64, ext, activePath);
  },

  updateFrontmatter(
    relativePath: string,
    patch: Partial<{ tags: string[]; emoji: string | null }>
  ): Promise<NoteRecord> {
    return window.electronAPI.invoke<NoteRecord>(IPC.FILE_UPDATE_FRONTMATTER, relativePath, patch);
  },

  getRelationshipTypes(): Promise<string[]> {
    return window.electronAPI.invoke<string[]>(IPC.VAULT_GET_RELATIONSHIP_TYPES);
  },

  getBacklinks(noteId: string): Promise<NoteRecord[]> {
    return window.electronAPI.invoke<NoteRecord[]>(IPC.VAULT_GET_BACKLINKS, noteId);
  },

  onFileChanged(handler: (event: FileChangedEvent) => void): () => void {
    return window.electronAPI.on(IPC.VAULT_FILE_CHANGED, handler as (...args: unknown[]) => void);
  },

  onFileDeleted(handler: (relativePath: string) => void): () => void {
    return window.electronAPI.on(IPC.VAULT_FILE_DELETED, handler as (...args: unknown[]) => void);
  },
};

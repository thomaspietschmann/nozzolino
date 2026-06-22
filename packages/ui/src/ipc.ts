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

  renameFile(relativePath: string, newTitle: string): Promise<NoteRecord> {
    return window.electronAPI.invoke<NoteRecord>(IPC.FILE_RENAME, relativePath, newTitle);
  },

  deleteFile(relativePath: string): Promise<void> {
    return window.electronAPI.invoke<void>(IPC.FILE_DELETE, relativePath);
  },

  saveImage(base64: string, ext: string): Promise<string> {
    return window.electronAPI.invoke<string>(IPC.IMAGE_SAVE, base64, ext);
  },

  onFileChanged(handler: (event: FileChangedEvent) => void): () => void {
    return window.electronAPI.on(IPC.VAULT_FILE_CHANGED, handler as (...args: unknown[]) => void);
  },

  onFileDeleted(handler: (relativePath: string) => void): () => void {
    return window.electronAPI.on(IPC.VAULT_FILE_DELETED, handler as (...args: unknown[]) => void);
  },
};

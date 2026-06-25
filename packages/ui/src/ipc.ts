import { IPC } from '@notes-app/common';
import type { NoteRecord, ConflictRecord, SyncSettings, SyncStatus } from '@notes-app/common';

export interface TestConnectionResult {
  ok: boolean;
  version?: string;
  error?: string;
}

/** Mirror of @notes-app/import's ImportSummary (kept local so ui stays decoupled). */
export interface ImportSummary {
  noteCount: number;
  tagCount: number;
  linkCount: number;
  unresolvedLinks: number;
  attachmentCount: number;
}

export interface RecentVault {
  path: string;
  name: string;
  lastOpened: string;
}

export interface FileChangedEvent {
  event: 'add' | 'change' | 'unlink';
  relativePath: string;
  record?: NoteRecord;
  /** True when the event echoes the app's own last write — not an external modification. */
  selfWrite?: boolean;
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

  onConflictDetected(handler: (record: ConflictRecord) => void): () => void {
    return window.electronAPI.on(IPC.VAULT_CONFLICT_DETECTED, handler as (...args: unknown[]) => void);
  },

  onConflictRemoved(handler: (conflictFilePath: string) => void): () => void {
    return window.electronAPI.on(IPC.VAULT_CONFLICT_REMOVED, handler as (...args: unknown[]) => void);
  },

  resolveConflict(notePath: string, conflictFilePath: string, mergedContent: string): Promise<NoteRecord> {
    return window.electronAPI.invoke<NoteRecord>(IPC.SYNC_RESOLVE_CONFLICT, notePath, conflictFilePath, mergedContent);
  },

  createConflictFromExternal(notePath: string, timestamp: string): Promise<ConflictRecord> {
    return window.electronAPI.invoke<ConflictRecord>(IPC.SYNC_CREATE_CONFLICT_FROM_EXTERNAL, notePath, timestamp);
  },

  exportZip(): Promise<string | null> {
    return window.electronAPI.invoke<string | null>(IPC.EXPORT_ZIP);
  },

  // ─── Sync — server mode (M7) ──────────────────────────────────────────────
  getSyncConfig(): Promise<SyncSettings> {
    return window.electronAPI.invoke<SyncSettings>(IPC.SYNC_GET_CONFIG);
  },

  setSyncConfig(config: SyncSettings): Promise<void> {
    return window.electronAPI.invoke<void>(IPC.SYNC_SET_CONFIG, config);
  },

  testConnection(url: string, token: string): Promise<TestConnectionResult> {
    return window.electronAPI.invoke<TestConnectionResult>(IPC.SYNC_TEST_CONNECTION, url, token);
  },

  forceSync(): Promise<void> {
    return window.electronAPI.invoke<void>(IPC.SYNC_FORCE_SYNC);
  },

  onSyncStatusChanged(handler: (status: SyncStatus) => void): () => void {
    return window.electronAPI.on(IPC.SYNC_STATUS_CHANGED, handler as (...args: unknown[]) => void);
  },

  // ─── Import — Anytype (M8) ────────────────────────────────────────────────
  pickAnytypeFile(): Promise<string | null> {
    return window.electronAPI.invoke<string | null>(IPC.IMPORT_ANYTYPE_PICK);
  },

  previewAnytypeImport(filePath: string): Promise<ImportSummary> {
    return window.electronAPI.invoke<ImportSummary>(IPC.IMPORT_ANYTYPE_PREVIEW, filePath);
  },

  runAnytypeImport(filePath: string): Promise<ImportSummary> {
    return window.electronAPI.invoke<ImportSummary>(IPC.IMPORT_ANYTYPE_RUN, filePath);
  },

  onImportProgress(handler: (p: { done: number; total: number }) => void): () => void {
    return window.electronAPI.on(IPC.IMPORT_PROGRESS, handler as (...args: unknown[]) => void);
  },
};

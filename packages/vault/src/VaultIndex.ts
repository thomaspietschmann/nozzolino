import { join } from 'path';
import type { NoteRecord } from '@notes-app/common';
import { scanVault } from './VaultScanner.js';
import { parseNote } from './NoteParser.js';

export interface VaultIndex {
  readonly vaultRoot: string;
  getAllNotes(): NoteRecord[];
  getNoteById(id: string): NoteRecord | undefined;
  getNoteByTitle(title: string): NoteRecord | undefined;
  getNoteByPath(relativePath: string): NoteRecord | undefined;
  getBacklinks(noteId: string): NoteRecord[];
  updateNote(record: NoteRecord): void;
  removeByPath(relativePath: string): void;
  addOrRefresh(absolutePath: string): Promise<NoteRecord>;
}

export async function buildVaultIndex(vaultRoot: string): Promise<VaultIndex> {
  const byId = new Map<string, NoteRecord>();
  const byTitle = new Map<string, NoteRecord>();
  const byPath = new Map<string, NoteRecord>();

  const paths = await scanVault(vaultRoot);
  await Promise.all(
    paths.map(async (absPath) => {
      try {
        const record = await parseNote(absPath, vaultRoot);
        indexRecord(record, byId, byTitle, byPath);
      } catch {
        // Skip unreadable files silently
      }
    })
  );

  function indexRecord(
    record: NoteRecord,
    idMap: Map<string, NoteRecord>,
    titleMap: Map<string, NoteRecord>,
    pathMap: Map<string, NoteRecord>
  ) {
    idMap.set(record.id, record);
    titleMap.set(record.title.toLowerCase(), record);
    pathMap.set(record.path, record);
  }

  return {
    vaultRoot,

    getAllNotes(): NoteRecord[] {
      return [...byId.values()];
    },

    getNoteById(id: string): NoteRecord | undefined {
      return byId.get(id);
    },

    getNoteByTitle(title: string): NoteRecord | undefined {
      return byTitle.get(title.toLowerCase());
    },

    getNoteByPath(relativePath: string): NoteRecord | undefined {
      return byPath.get(relativePath);
    },

    getBacklinks(noteId: string): NoteRecord[] {
      const target = byId.get(noteId);
      if (!target) return [];
      return [...byId.values()].filter((n) =>
        n.outlinks.some((l) => l.targetTitle.toLowerCase() === target.title.toLowerCase())
      );
    },

    updateNote(record: NoteRecord): void {
      const old = byId.get(record.id);
      if (old) {
        byTitle.delete(old.title.toLowerCase());
        byPath.delete(old.path);
      }
      indexRecord(record, byId, byTitle, byPath);
    },

    removeByPath(relativePath: string): void {
      const record = byPath.get(relativePath);
      if (!record) return;
      byId.delete(record.id);
      byTitle.delete(record.title.toLowerCase());
      byPath.delete(relativePath);
    },

    async addOrRefresh(absolutePath: string): Promise<NoteRecord> {
      const record = await parseNote(absolutePath, vaultRoot);
      const existing = byPath.get(record.path);
      if (existing && existing.id !== record.id) {
        byId.delete(existing.id);
        byTitle.delete(existing.title.toLowerCase());
      }
      indexRecord(record, byId, byTitle, byPath);
      return record;
    },
  };
}

export function absolutePath(vaultRoot: string, relativePath: string): string {
  return join(vaultRoot, relativePath);
}

import { posixBasename } from '@notes-app/common';
import type { NoteRecord } from '@notes-app/common';
import { SYNCTHING_CONFLICT_INFIX } from '@notes-app/common';
import type { VaultFS } from './VaultFS.js';
import { scanVault } from './VaultScanner.js';
import { parseNote } from './NoteParser.js';

export interface VaultIndex {
  getAllNotes(): NoteRecord[];
  getNoteById(id: string): NoteRecord | undefined;
  getNoteByTitle(title: string): NoteRecord | undefined;
  getNoteByPath(relativePath: string): NoteRecord | undefined;
  getBacklinks(noteId: string): NoteRecord[];
  /** Returns every distinct relationship type used in outlinks across the vault. */
  getRelationshipTypes(): string[];
  updateNote(record: NoteRecord): void;
  removeByPath(relativePath: string): void;
  addOrRefresh(vaultFS: VaultFS, relativePath: string): Promise<NoteRecord>;
}

export async function buildVaultIndex(vaultFS: VaultFS): Promise<VaultIndex> {
  const byId = new Map<string, NoteRecord>();
  const byTitle = new Map<string, NoteRecord>();
  const byPath = new Map<string, NoteRecord>();

  const paths = await scanVault(vaultFS);
  await Promise.all(
    paths.map(async (relPath) => {
      try {
        const record = await parseNote(vaultFS, relPath);
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

    getRelationshipTypes(): string[] {
      const seen = new Set<string>();
      for (const note of byId.values()) {
        for (const link of note.outlinks) {
          if (link.relationshipType) seen.add(link.relationshipType);
        }
      }
      return [...seen].sort();
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

    async addOrRefresh(vaultFS: VaultFS, relativePath: string): Promise<NoteRecord> {
      // Conflict copies must never enter the note index
      if (posixBasename(relativePath).includes(SYNCTHING_CONFLICT_INFIX)) {
        throw new Error(`Refusing to index conflict file: ${relativePath}`);
      }
      const record = await parseNote(vaultFS, relativePath);
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

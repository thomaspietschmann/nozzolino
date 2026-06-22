import { openDB, type IDBPDatabase } from 'idb';
import type { VaultFS, DirEntry } from '@notes-app/vault';

const DB_VERSION = 1;

async function openVaultDB(dbName: string): Promise<IDBPDatabase> {
  return openDB(dbName, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('text')) {
        db.createObjectStore('text', { keyPath: 'path' });
      }
      if (!db.objectStoreNames.contains('binary')) {
        db.createObjectStore('binary', { keyPath: 'path' });
      }
    },
  });
}

/**
 * IndexedDB-backed VaultFS implementation for web/mobile.
 * Uses two object stores keyed by vault-relative POSIX path:
 *   - "text"   → { path, content, mtime }
 *   - "binary" → { path, data (base64), mtime }
 * Directories are implicit (no separate store).
 */
export class WebVaultFS implements VaultFS {
  private db: IDBPDatabase | null = null;

  constructor(private readonly dbName: string) {}

  async open(): Promise<void> {
    this.db = await openVaultDB(this.dbName);
  }

  private getDB(): IDBPDatabase {
    if (!this.db) throw new Error('WebVaultFS not opened — call open() first');
    return this.db;
  }

  async isEmpty(): Promise<boolean> {
    const db = this.getDB();
    const count = await db.count('text');
    const bcount = await db.count('binary');
    return count === 0 && bcount === 0;
  }

  /** Seed initial demo content. Skips entries that already exist. */
  async seed(files: Record<string, string>): Promise<void> {
    const db = this.getDB();
    const tx = db.transaction('text', 'readwrite');
    const now = Date.now();
    for (const [path, content] of Object.entries(files)) {
      const existing = await tx.store.get(path);
      if (!existing) {
        await tx.store.put({ path, content, mtime: now });
      }
    }
    await tx.done;
  }

  async readFile(path: string): Promise<string> {
    const row = await this.getDB().get('text', path);
    if (!row) throw new Error(`ENOENT: ${path}`);
    return row.content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.getDB().put('text', { path, content, mtime: Date.now() });
  }

  async renameFile(from: string, to: string): Promise<void> {
    const db = this.getDB();
    const row = await db.get('text', from);
    if (!row) throw new Error(`ENOENT: ${from}`);
    const tx = db.transaction('text', 'readwrite');
    await tx.store.put({ ...row, path: to });
    await tx.store.delete(from);
    await tx.done;
  }

  async deleteFile(path: string): Promise<void> {
    const db = this.getDB();
    await db.delete('text', path);
    await db.delete('binary', path);
  }

  async listDirectory(path: string): Promise<DirEntry[]> {
    const db = this.getDB();
    const prefix = path && path !== '.' ? `${path}/` : '';
    const seen = new Set<string>();
    const entries: DirEntry[] = [];

    const addEntries = (keys: string[]) => {
      for (const key of keys) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const i = rest.indexOf('/');
        if (i < 0) {
          if (!seen.has(rest)) {
            seen.add(rest);
            entries.push({ name: rest, path: prefix + rest, isDirectory: false });
          }
        } else {
          const dirName = rest.slice(0, i);
          if (!seen.has(dirName)) {
            seen.add(dirName);
            entries.push({ name: dirName, path: prefix + dirName, isDirectory: true });
          }
        }
      }
    };

    const textKeys = await db.getAllKeys('text') as string[];
    const binaryKeys = await db.getAllKeys('binary') as string[];
    addEntries(textKeys);
    addEntries(binaryKeys);
    return entries;
  }

  async exists(path: string): Promise<boolean> {
    const db = this.getDB();
    const t = await db.getKey('text', path);
    if (t !== undefined) return true;
    const b = await db.getKey('binary', path);
    return b !== undefined;
  }

  async mkdir(_path: string): Promise<void> {
    // No-op: directories are implicit from file paths in WebVaultFS
  }

  async stat(path: string): Promise<{ mtime: Date }> {
    const db = this.getDB();
    const row = (await db.get('text', path)) ?? (await db.get('binary', path));
    if (!row) throw new Error(`ENOENT: ${path}`);
    return { mtime: new Date(row.mtime) };
  }

  async writeBinaryFile(path: string, base64: string): Promise<void> {
    await this.getDB().put('binary', { path, data: base64, mtime: Date.now() });
  }
}

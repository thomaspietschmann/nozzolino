import { promises as fs } from 'node:fs';
import { dirname, join, posix, sep } from 'node:path';
import { computeEtag } from './etag';
import { META_DIR } from './paths';

export interface FileEntry {
  path: string;
  etag: string;
  mtime: number;
}

export interface ReadResult {
  content: Buffer;
  etag: string;
  mtime: number;
}

interface Sidecar {
  etag: string;
  mtime: number;
}

/**
 * File-backed store for the vault directory. Maintains a `.meta/` tree of
 * ETag sidecars mirroring the vault layout (ADR-0009).
 */
export class FileStore {
  constructor(private readonly vaultDir: string) {}

  private full(relPath: string): string {
    return join(this.vaultDir, relPath.split('/').join(sep));
  }

  private sidecarPath(relPath: string): string {
    return join(this.vaultDir, META_DIR, `${relPath}.json`.split('/').join(sep));
  }

  private async readSidecar(relPath: string): Promise<Sidecar | null> {
    try {
      const raw = await fs.readFile(this.sidecarPath(relPath), 'utf8');
      return JSON.parse(raw) as Sidecar;
    } catch {
      return null;
    }
  }

  private async writeSidecar(relPath: string, meta: Sidecar): Promise<void> {
    const p = this.sidecarPath(relPath);
    await fs.mkdir(dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(meta));
  }

  private async deleteSidecar(relPath: string): Promise<void> {
    try {
      await fs.unlink(this.sidecarPath(relPath));
    } catch {
      /* ignore */
    }
  }

  /** True if the file exists in the vault. */
  async exists(relPath: string): Promise<boolean> {
    try {
      const st = await fs.stat(this.full(relPath));
      return st.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Returns the current ETag for a file, computing and persisting the sidecar
   * lazily when missing or stale (handles files dropped into the volume out of band).
   */
  async etagFor(relPath: string): Promise<string | null> {
    let st;
    try {
      st = await fs.stat(this.full(relPath));
    } catch {
      return null;
    }
    if (!st.isFile()) return null;
    const mtime = Math.floor(st.mtimeMs);
    const side = await this.readSidecar(relPath);
    if (side && side.mtime === mtime) return side.etag;
    const content = await fs.readFile(this.full(relPath));
    const etag = computeEtag(content);
    await this.writeSidecar(relPath, { etag, mtime });
    return etag;
  }

  /** Lists every file in the vault (skips `.meta`, dotfiles, `*.tmp`). */
  async list(): Promise<FileEntry[]> {
    const out: FileEntry[] = [];
    const walk = async (dirRel: string): Promise<void> => {
      const abs = dirRel ? this.full(dirRel) : this.vaultDir;
      let entries;
      try {
        entries = await fs.readdir(abs, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        const name = ent.name;
        if (name === META_DIR || name.startsWith('.') || name.endsWith('.tmp')) continue;
        const rel = dirRel ? posix.join(dirRel, name) : name;
        if (ent.isDirectory()) {
          await walk(rel);
        } else if (ent.isFile()) {
          const etag = await this.etagFor(rel);
          if (etag == null) continue;
          const st = await fs.stat(this.full(rel));
          out.push({ path: rel, etag, mtime: Math.floor(st.mtimeMs) });
        }
      }
    };
    await walk('');
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  /** Reads a file's content + metadata, or null if absent. */
  async read(relPath: string): Promise<ReadResult | null> {
    let st;
    try {
      st = await fs.stat(this.full(relPath));
    } catch {
      return null;
    }
    if (!st.isFile()) return null;
    const content = await fs.readFile(this.full(relPath));
    const mtime = Math.floor(st.mtimeMs);
    const side = await this.readSidecar(relPath);
    const etag = side && side.mtime === mtime ? side.etag : computeEtag(content);
    if (!side || side.mtime !== mtime) await this.writeSidecar(relPath, { etag, mtime });
    return { content, etag, mtime };
  }

  /** Atomically writes a file (temp + rename) and refreshes its sidecar. */
  async write(relPath: string, content: Buffer): Promise<FileEntry> {
    const target = this.full(relPath);
    await fs.mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.tmp`;
    await fs.writeFile(tmp, content);
    await fs.rename(tmp, target);
    const st = await fs.stat(target);
    const mtime = Math.floor(st.mtimeMs);
    const etag = computeEtag(content);
    await this.writeSidecar(relPath, { etag, mtime });
    return { path: relPath, etag, mtime };
  }

  /** Deletes a file and its sidecar. Returns false if the file was absent. */
  async delete(relPath: string): Promise<boolean> {
    const existed = await this.exists(relPath);
    try {
      await fs.unlink(this.full(relPath));
    } catch {
      /* ignore */
    }
    await this.deleteSidecar(relPath);
    return existed;
  }
}

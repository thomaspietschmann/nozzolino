import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Abstraction over the source of import files.
 * Backed by either an in-memory map, a directory on disk, or a zip archive.
 */
export interface ImportSource {
  /** Returns the list of all file paths (relative to the source root). */
  list(): string[];
  /** Reads a file as UTF-8 text. */
  readText(path: string): Promise<string>;
  /** Reads a file as raw bytes. */
  readBinary(path: string): Promise<Uint8Array>;
}

// ─── MemoryImportSource ───────────────────────────────────────────────────────

/**
 * ImportSource backed by an in-memory Record<path, text>.
 * Useful for unit tests that do not require a real file system.
 */
export class MemoryImportSource implements ImportSource {
  private readonly files: Record<string, string>;

  constructor(files: Record<string, string>) {
    this.files = files;
  }

  list(): string[] {
    return Object.keys(this.files);
  }

  async readText(path: string): Promise<string> {
    const content = this.files[path];
    if (content === undefined) throw new Error(`MemoryImportSource: file not found: ${path}`);
    return content;
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const text = await this.readText(path);
    return new TextEncoder().encode(text);
  }
}

// ─── DirImportSource ─────────────────────────────────────────────────────────

/**
 * ImportSource backed by a real directory on disk.
 * Walks the directory recursively at construction time via `init()`.
 */
export class DirImportSource implements ImportSource {
  private readonly root: string;
  private paths: string[] = [];

  constructor(root: string) {
    this.root = root;
  }

  /**
   * Recursively collects all file paths under `root`.
   * Must be called before `list()` / `readText()` / `readBinary()`.
   */
  async init(): Promise<this> {
    this.paths = await collectPaths(this.root, this.root);
    return this;
  }

  list(): string[] {
    return this.paths;
  }

  async readText(relativePath: string): Promise<string> {
    const abs = join(this.root, relativePath);
    return readFile(abs, 'utf-8');
  }

  async readBinary(relativePath: string): Promise<Uint8Array> {
    const abs = join(this.root, relativePath);
    const buf = await readFile(abs);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
}

async function collectPaths(root: string, dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    const rel = abs.slice(root.length + 1).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      const sub = await collectPaths(root, abs);
      results.push(...sub);
    } else {
      results.push(rel);
    }
  }
  return results;
}

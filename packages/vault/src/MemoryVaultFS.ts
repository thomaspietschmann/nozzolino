import type { VaultFS, DirEntry } from './VaultFS.js';

/** Map-backed VaultFS implementation for use in unit tests. No Node.js dependencies. */
export class MemoryVaultFS implements VaultFS {
  private text = new Map<string, string>();
  private binary = new Map<string, string>(); // path → base64
  private mtimes = new Map<string, Date>();

  seed(path: string, content: string, mtime?: Date): void {
    this.text.set(path, content);
    this.mtimes.set(path, mtime ?? new Date());
  }

  async readFile(path: string): Promise<string> {
    if (!this.text.has(path)) throw new Error(`ENOENT: ${path}`);
    return this.text.get(path)!;
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.text.set(path, content);
    this.mtimes.set(path, new Date());
  }

  async renameFile(from: string, to: string): Promise<void> {
    const content = this.text.get(from);
    if (content === undefined) throw new Error(`ENOENT: ${from}`);
    this.text.set(to, content);
    this.mtimes.set(to, this.mtimes.get(from) ?? new Date());
    this.text.delete(from);
    this.mtimes.delete(from);
  }

  async deleteFile(path: string): Promise<void> {
    this.text.delete(path);
    this.binary.delete(path);
    this.mtimes.delete(path);
  }

  async listDirectory(path: string): Promise<DirEntry[]> {
    const prefix = path && path !== '.' ? `${path}/` : '';
    const seen = new Set<string>();
    const entries: DirEntry[] = [];

    for (const key of [...this.text.keys(), ...this.binary.keys()]) {
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
    return entries;
  }

  async exists(path: string): Promise<boolean> {
    return this.text.has(path) || this.binary.has(path);
  }

  async mkdir(_path: string): Promise<void> {
    // No-op: directories are implicit from file paths in MemoryVaultFS
  }

  async stat(path: string): Promise<{ mtime: Date }> {
    if (!this.text.has(path) && !this.binary.has(path)) {
      throw new Error(`ENOENT: ${path}`);
    }
    return { mtime: this.mtimes.get(path) ?? new Date() };
  }

  async writeBinaryFile(path: string, base64: string): Promise<void> {
    this.binary.set(path, base64);
    this.mtimes.set(path, new Date());
  }

  getTextFiles(): Map<string, string> {
    return new Map(this.text);
  }

  getBinaryFiles(): Map<string, string> {
    return new Map(this.binary);
  }
}

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { posixJoin } from '@notes-app/common';
import type { VaultFS, DirEntry } from './VaultFS.js';

/** Node.js implementation that takes vault-relative paths and resolves them against vaultRoot. */
export class NodeVaultFS implements VaultFS {
  constructor(private readonly vaultRoot: string) {}

  private abs(relPath: string): string {
    return join(this.vaultRoot, relPath);
  }

  async readFile(path: string): Promise<string> {
    return fs.readFile(this.abs(path), 'utf-8');
  }

  async writeFile(path: string, content: string): Promise<void> {
    const abs = this.abs(path);
    await fs.mkdir(dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf-8');
  }

  async renameFile(from: string, to: string): Promise<void> {
    const absTo = this.abs(to);
    await fs.mkdir(dirname(absTo), { recursive: true });
    await fs.rename(this.abs(from), absTo);
  }

  async deleteFile(path: string): Promise<void> {
    await fs.unlink(this.abs(path));
  }

  async listDirectory(path: string): Promise<DirEntry[]> {
    const abs = this.abs(path || '.');
    const entries = await fs.readdir(abs, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      path: path ? posixJoin(path, e.name) : e.name,
      isDirectory: e.isDirectory(),
    }));
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(this.abs(path));
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(path: string): Promise<void> {
    await fs.mkdir(this.abs(path), { recursive: true });
  }

  async stat(path: string): Promise<{ mtime: Date }> {
    const s = await fs.stat(this.abs(path));
    return { mtime: s.mtime };
  }

  async writeBinaryFile(path: string, base64: string): Promise<void> {
    const abs = this.abs(path);
    await fs.mkdir(dirname(abs), { recursive: true });
    await fs.writeFile(abs, Buffer.from(base64, 'base64'));
  }

  async readBinaryFile(path: string): Promise<string> {
    const buf = await fs.readFile(this.abs(path));
    return Buffer.from(buf).toString('base64');
  }
}

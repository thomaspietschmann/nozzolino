import { promises as fs } from 'fs';
import { join, dirname } from 'path';

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface VaultFS {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  renameFile(from: string, to: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  listDirectory(path: string): Promise<DirEntry[]>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
}

export class NodeVaultFS implements VaultFS {
  async readFile(path: string): Promise<string> {
    return fs.readFile(path, 'utf-8');
  }

  async writeFile(path: string, content: string): Promise<void> {
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, content, 'utf-8');
  }

  async renameFile(from: string, to: string): Promise<void> {
    await fs.mkdir(dirname(to), { recursive: true });
    await fs.rename(from, to);
  }

  async deleteFile(path: string): Promise<void> {
    await fs.unlink(path);
  }

  async listDirectory(path: string): Promise<DirEntry[]> {
    const entries = await fs.readdir(path, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      path: join(path, e.name),
      isDirectory: e.isDirectory(),
    }));
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(path: string): Promise<void> {
    await fs.mkdir(path, { recursive: true });
  }
}

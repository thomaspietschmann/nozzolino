import { SYNCTHING_CONFLICT_INFIX } from '@notes-app/common';
import type { VaultFS } from './VaultFS.js';

const IGNORED_DIRS = new Set([
  '.git',
  '.obsidian',
  'node_modules',
  '.DS_Store',
  '.trash',
]);

/** Recursively scans the vault and returns all vault-relative .md file paths. */
export async function scanVault(vaultFS: VaultFS): Promise<string[]> {
  const results: string[] = [];
  await walk(vaultFS, '', results);
  return results;
}

async function walk(vaultFS: VaultFS, dir: string, results: string[]): Promise<void> {
  let entries;
  try {
    entries = await vaultFS.listDirectory(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
    if (entry.isDirectory) {
      await walk(vaultFS, entry.path, results);
    } else if (entry.name.endsWith('.md') && !entry.name.includes(SYNCTHING_CONFLICT_INFIX)) {
      results.push(entry.path);
    }
  }
}

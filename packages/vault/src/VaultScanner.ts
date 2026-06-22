import { promises as fs } from 'fs';
import { join } from 'path';

const IGNORED_DIRS = new Set([
  '.git',
  '.obsidian',
  'node_modules',
  '.DS_Store',
  '.trash',
]);

/**
 * Recursively scans a directory and returns all .md file paths.
 * Skips hidden directories and known tool directories.
 */
export async function scanVault(vaultRoot: string): Promise<string[]> {
  const results: string[] = [];
  await walk(vaultRoot, results);
  return results;
}

async function walk(dir: string, results: string[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, results);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
}

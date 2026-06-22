import { parseFrontmatter, parseWikiLinks, posixBasename } from '@notes-app/common';
import type { NoteRecord } from '@notes-app/common';
import type { VaultFS } from './VaultFS.js';

/**
 * Parses a .md file and returns a NoteRecord.
 *
 * UUID assignment is lazy (ADR-0006): if the file has no `id` in its
 * frontmatter, we generate one in memory but do NOT write it back to disk
 * here. The caller (VaultIndex) persists the UUID only on the first
 * explicit user save.
 */
export async function parseNote(vaultFS: VaultFS, relativePath: string): Promise<NoteRecord> {
  const raw = await vaultFS.readFile(relativePath);
  const { mtime } = await vaultFS.stat(relativePath);
  return parseNoteContent(raw, relativePath, mtime);
}

export function parseNoteContent(content: string, relativePath: string, mtime: Date): NoteRecord {
  const { frontmatter, body } = parseFrontmatter(content);

  const id = frontmatter.id ?? generateId();
  const title = posixBasename(relativePath, '.md');

  return {
    id,
    path: relativePath,
    title,
    emoji: frontmatter.emoji ?? null,
    tags: frontmatter.tags,
    outlinks: parseWikiLinks(body),
    created: frontmatter.created ? new Date(frontmatter.created) : undefined,
    modified: mtime,
    bodyText: body,
  };
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

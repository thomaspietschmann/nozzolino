import { basename, relative } from 'path';
import { parseFrontmatter, parseWikiLinks } from '@notes-app/common';
import type { NoteRecord } from '@notes-app/common';
import { promises as fs } from 'fs';

/**
 * Parses a .md file and returns a NoteRecord.
 *
 * UUID assignment is lazy (ADR-0006): if the file has no `id` in its
 * frontmatter, we generate one in memory but do NOT write it back to disk
 * here. The caller (VaultIndex) persists the UUID only on the first
 * explicit user save.
 */
export async function parseNote(
  filePath: string,
  vaultRoot: string
): Promise<NoteRecord> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const stat = await fs.stat(filePath);
  return parseNoteContent(raw, filePath, vaultRoot, stat.mtime);
}

export function parseNoteContent(
  content: string,
  filePath: string,
  vaultRoot: string,
  mtime: Date
): NoteRecord {
  const { frontmatter, body } = parseFrontmatter(content);

  const id = frontmatter.id ?? generateId();
  const fileName = basename(filePath, '.md');
  const title = fileName;

  return {
    id,
    path: relative(vaultRoot, filePath),
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
  // Node 14 fallback (shouldn't be needed with Node ≥22)
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

import { parseFrontmatter, serializeFrontmatter } from '@notes-app/common';
import type { Frontmatter } from '@notes-app/common';

/**
 * Merges an editor body with the existing frontmatter, persisting the note's
 * id/created/modified fields (ADR-0006). Pure function — no file I/O.
 *
 * @param rawExisting - Current file content from disk, or null for brand-new files.
 * @param body        - Editor output: plain Markdown, no frontmatter block.
 * @param opts.id     - In-memory id to assign when the file has none yet.
 */
export function mergeForSave(
  rawExisting: string | null,
  body: string,
  opts: { id: string }
): string {
  const existing: Frontmatter = rawExisting
    ? parseFrontmatter(rawExisting).frontmatter
    : { tags: [] };

  const now = new Date().toISOString();

  const merged: Frontmatter = {
    ...existing,
    id: existing.id ?? opts.id,
    tags: existing.tags,
    created: existing.created ?? now,
    modified: now,
  };

  return serializeFrontmatter(merged, body);
}

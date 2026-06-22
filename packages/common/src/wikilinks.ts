import type { Outlink } from './types.js';

/**
 * Canonical wiki-link regex. Single source of truth (ADR-0011).
 *
 * Matches:
 *   [[Note Title]]            → group 1: "Note Title",  group 2: undefined
 *   [[Note Title||client of]] → group 1: "Note Title",  group 2: "client of"
 *
 * Does NOT match:
 *   [[Title|alias]]  — single pipe is not our separator (used in Markdown tables)
 *
 * Flags: 'g' is intentionally omitted here — callers must create a fresh RegExp
 * with the 'g' flag via `new RegExp(WIKILINK_REGEX.source, 'g')` to avoid the
 * shared lastIndex problem when the regex is used in multiple places concurrently.
 */
export const WIKILINK_REGEX = /\[\[([^\]|]+?)(?:\|\|([^\]]+?))?\]\]/;

/**
 * Extracts all wiki-links from a string of note body content.
 *
 * @param content - Raw body text (Markdown, with frontmatter already stripped).
 * @returns Array of outgoing links in document order. May be empty.
 */
export function parseWikiLinks(content: string): Outlink[] {
  const regex = new RegExp(WIKILINK_REGEX.source, 'g');
  const outlinks: Outlink[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const targetTitle = match[1];
    if (!targetTitle) continue; // guard for noUncheckedIndexedAccess; regex guarantees group 1

    outlinks.push({
      targetTitle: targetTitle.trim(),
      relationshipType: match[2]?.trim() ?? null,
    });
  }

  return outlinks;
}

/**
 * Rewrites all wiki-links pointing at `oldTitle` to point at `newTitle`.
 * Preserves the relationship type (the ||TYPE part) unchanged.
 *
 * Algorithm: technical-guidelines §9.
 *
 * @param content   - Full file content (frontmatter + body).
 * @param oldTitle  - Exact title string to find (case-sensitive).
 * @param newTitle  - Replacement title string.
 * @returns Updated content. If no links matched, the original string is returned as-is.
 */
export function replaceWikiLinkTarget(
  content: string,
  oldTitle: string,
  newTitle: string
): string {
  const pattern = new RegExp(
    `\\[\\[${escapeRegex(oldTitle)}(\\|\\|[^\\]]*)?\\]\\]`,
    'g'
  );
  return content.replace(pattern, (_match, rel: string | undefined) => {
    return `[[${newTitle}${rel ?? ''}]]`;
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Escapes a string for safe use as a literal inside a RegExp pattern. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

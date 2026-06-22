import { CORE_SCHEMA, dump, load } from 'js-yaml';
import type { Frontmatter } from './types.js';

/**
 * Parses a .md file's content into structured frontmatter and body text.
 *
 * Expected format:
 *   ---
 *   key: value
 *   ---
 *   body text
 *
 * Rules (ADR-0004):
 * - `tags` is always normalised to an array, never a string.
 * - `created` / `modified` are always kept as ISO 8601 strings, never Date objects.
 *   (We use CORE_SCHEMA to disable js-yaml's automatic timestamp coercion.)
 * - Unknown frontmatter fields are preserved (externally edited files may add fields).
 * - If frontmatter is absent or malformed, returns empty/default values.
 */
export function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return { frontmatter: { tags: [] }, body: content };
  }

  // Opening delimiter is '---' on the first line. Find where that line ends.
  const startLen = content.indexOf('\n') + 1;

  // Find the closing '---' delimiter (must begin at the start of a line, i.e. after '\n').
  const closeIndex = content.indexOf('\n---', startLen);
  if (closeIndex === -1) {
    return { frontmatter: { tags: [] }, body: content };
  }

  const yamlStr = content.slice(startLen, closeIndex);

  // Advance past '\n---' and the line ending that follows it.
  let bodyStart = closeIndex + 4; // '\n---' is 4 chars
  if (content[bodyStart] === '\r') bodyStart++;
  if (content[bodyStart] === '\n') bodyStart++;

  const body = content.slice(bodyStart);

  // CORE_SCHEMA prevents js-yaml from auto-converting ISO timestamps to Date objects.
  const raw = (load(yamlStr, { schema: CORE_SCHEMA }) ?? {}) as Record<string, unknown>;

  const frontmatter: Frontmatter = {
    ...raw,
    tags: normalizeTags(raw['tags']),
    id: typeof raw['id'] === 'string' ? raw['id'] : undefined,
    emoji: typeof raw['emoji'] === 'string' ? raw['emoji'] : undefined,
    created: typeof raw['created'] === 'string' ? raw['created'] : undefined,
    modified: typeof raw['modified'] === 'string' ? raw['modified'] : undefined,
  };

  return { frontmatter, body };
}

/**
 * Serializes frontmatter and body back to a complete .md file string.
 *
 * The result is round-trip stable: parsing the output of this function
 * produces the same frontmatter values and body that were passed in.
 */
export function serializeFrontmatter(frontmatter: Frontmatter, body: string): string {
  // CORE_SCHEMA prevents js-yaml from serialising ISO strings as YAML timestamps.
  // dump() always ends with '\n', giving us: ---\n<yaml>---\n<body>
  const yaml = dump(frontmatter as Record<string, unknown>, {
    lineWidth: -1,
    schema: CORE_SCHEMA,
  });
  return `---\n${yaml}---\n${body}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalises a raw frontmatter `tags` value to a string array.
 * Handles: YAML list (string[]), single string, undefined/null.
 */
function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((t): t is string => typeof t === 'string');
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return [value.trim()];
  }
  return [];
}

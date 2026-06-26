import { parseFrontmatter, posixBasename } from '@notes-app/common';
import type { ImportSource } from './ImportSource.js';
import type { AnytypeObject } from './model.js';

/**
 * Anytype-internal system relations that carry no user value in our model and
 * should be dropped from the imported frontmatter (lower-cased for matching).
 * `id`, emoji, creation/modified dates and tags are handled explicitly below.
 */
const DROP_KEYS = new Set([
  'id',
  'object type',
  'backlinks',
  'links',
  'created by',
  'creator',
  'last modified by',
  'last opened date',
  'added date',
  'source',
]);

const EMOJI_KEYS = new Set(['emoji', 'icon']);
const CREATED_KEYS = new Set(['creation date', 'created', 'created date']);
const MODIFIED_KEYS = new Set(['last modified date', 'modified', 'last modification date']);
const TAG_KEYS = new Set(['tag', 'tags']);

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter((s) => s.length > 0);
  if (value === null || value === undefined) return [];
  const s = String(value);
  return s.length > 0 ? [s] : [];
}

/** Regex: markdown inline link: [label](target) */
const MD_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;

/** Regex: markdown image: ![alt](src) */
const MD_IMG_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Parses an Anytype Markdown export bundle and returns structured objects.
 *
 * Rules:
 * - Processes every `.md` file except top-level `index.md` / `_index.md`
 *   and anything directly inside a `files/` directory.
 * - Title = first `# Heading` in body, else decoded filename stem.
 * - Relations = non-reserved frontmatter fields normalised to string[].
 * - Links = inline markdown links whose decoded target ends with `.md`.
 * - Attachments = markdown images + links whose target is under `files/`
 *   or does not end with `.md`.
 */
export async function parseAnytypeBundle(source: ImportSource): Promise<AnytypeObject[]> {
  const paths = source.list();
  const mdPaths = paths.filter((p) => isMdFile(p));
  const results: AnytypeObject[] = [];

  for (const p of mdPaths) {
    const raw = await source.readText(p);
    const { frontmatter, body } = parseFrontmatter(raw);

    // Title — first non-empty H1, else the decoded filename stem.
    // (Anytype emits a bare `# ` heading with trailing spaces for untitled
    // objects, so guard against an empty capture with `||`.)
    const h1Match = /^#[ \t]+(.+)$/m.exec(body);
    const stem = decodeURIComponent(posixBasename(p, '.md'));
    const title = (h1Match?.[1]?.trim() || stem);

    // Relations — Anytype emits capitalised, spaced keys ("Object type",
    // "Creation date", "Tag", "Emoji", ...). Map the known ones to dedicated
    // fields, drop Anytype-internal system relations, keep the rest as
    // user-defined relations under their original key.
    const relations: Record<string, string[]> = {};
    let emoji: string | undefined;
    let createdAt: string | undefined;
    let modifiedAt: string | undefined;
    let objId: string | undefined;
    for (const [key, value] of Object.entries(frontmatter)) {
      const norm = key.trim().toLowerCase();
      const values = toStringArray(value);
      if (values.length === 0) continue;
      if (norm === 'id') {
        objId = values[0];
      } else if (EMOJI_KEYS.has(norm)) {
        emoji = values[0];
      } else if (CREATED_KEYS.has(norm)) {
        createdAt = values[0];
      } else if (MODIFIED_KEYS.has(norm)) {
        modifiedAt = values[0];
      } else if (TAG_KEYS.has(norm)) {
        relations['tags'] = values;
      } else if (!DROP_KEYS.has(norm)) {
        relations[key] = values;
      }
    }

    // Links: inline [label](target.md)
    const links: AnytypeObject['links'] = [];
    const linkMatches = [...body.matchAll(MD_LINK_RE)];
    for (const m of linkMatches) {
      const rawTarget = m[2] ?? '';
      const decoded = decodeURIComponent(rawTarget);
      if (decoded.endsWith('.md') && !isFilesPath(decoded)) {
        links.push({ targetRef: rawTarget, label: m[1] ?? '' });
      }
    }

    // Attachments: images + non-.md links
    const attachments: AnytypeObject['attachments'] = [];

    // Images (always attachments)
    const imgMatches = [...body.matchAll(MD_IMG_RE)];
    for (const m of imgMatches) {
      const ref = m[2] ?? '';
      attachments.push({ ref });
    }

    // Non-.md inline links (that aren't images — images handled above)
    // Re-scan links but pick non-.md targets
    for (const m of linkMatches) {
      const rawTarget = m[2] ?? '';
      const decoded = decodeURIComponent(rawTarget);
      if (!decoded.endsWith('.md') || isFilesPath(decoded)) {
        attachments.push({ ref: rawTarget });
      }
    }

    results.push({
      sourcePath: p,
      id: objId,
      title,
      body,
      relations,
      links,
      attachments,
      createdAt,
      modifiedAt,
      emoji,
    });
  }

  return results;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true for .md files that should be processed (excludes index files and files/ dir). */
function isMdFile(path: string): boolean {
  if (!path.endsWith('.md')) return false;
  const basename = posixBasename(path);
  if (basename === 'index.md' || basename === '_index.md') {
    // Only skip top-level index files (no slash in path)
    if (!path.includes('/')) return false;
  }
  // Skip anything directly under a files/ directory
  const parts = path.split('/');
  if (parts.includes('files')) return false;
  return true;
}

/** Returns true if a (decoded) link target is under a files/ directory. */
function isFilesPath(decoded: string): boolean {
  return decoded.startsWith('files/') || decoded.includes('/files/');
}

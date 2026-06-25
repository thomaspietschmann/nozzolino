import { parseFrontmatter, posixBasename } from '@notes-app/common';
import type { ImportSource } from './ImportSource.js';
import type { AnytypeObject } from './model.js';

/** Keys that are captured as dedicated AnytypeObject fields, not as relations. */
const RESERVED_KEYS = new Set(['id', 'created', 'modified', 'emoji']);

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

    // Title
    const h1Match = /^#[ \t]+(.+)$/m.exec(body);
    const stem = decodeURIComponent(posixBasename(p, '.md'));
    const title = h1Match?.[1]?.trim() ?? stem;

    // Relations — non-reserved frontmatter fields → string[]
    const relations: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(frontmatter)) {
      if (RESERVED_KEYS.has(key)) continue;
      if (Array.isArray(value)) {
        relations[key] = value.map(String);
      } else if (value !== null && value !== undefined) {
        relations[key] = [String(value)];
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
      title,
      body,
      relations,
      links,
      attachments,
      createdAt: typeof frontmatter.created === 'string' ? frontmatter.created : undefined,
      modifiedAt: typeof frontmatter.modified === 'string' ? frontmatter.modified : undefined,
      emoji: typeof frontmatter.emoji === 'string' ? frontmatter.emoji : undefined,
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

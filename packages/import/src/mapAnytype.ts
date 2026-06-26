import { serializeFrontmatter, posixBasename } from '@notes-app/common';
import type { Frontmatter } from '@notes-app/common';
import type { AnytypeObject, PreparedNote, ImportSummary } from './model.js';

/** Relation keys that contribute to the note's `tags` field. */
const TAG_KEY_RE = /^tags?$/i;
const STATUS_KEY_RE = /^status$/i;

function isTagRelation(key: string): boolean {
  return TAG_KEY_RE.test(key) || STATUS_KEY_RE.test(key);
}

/**
 * Pure mapping: converts a list of AnytypeObjects into PreparedNotes
 * and an ImportSummary.
 *
 * Steps:
 * 1. Build ref → final title map (handle title collisions).
 * 2. For each object: sanitize filename, deduplicate filenames.
 * 3. Map relations → tags (tag/status keys) + extra frontmatter.
 * 4. Replace markdown links with wikilinks where resolvable.
 * 5. Build and serialize frontmatter.
 */
export function mapObjects(objects: AnytypeObject[]): {
  notes: PreparedNote[];
  summary: ImportSummary;
} {
  // ── Step 1: build ref → title map with collision handling ─────────────────
  // First pass: collect all desired titles
  const rawTitles = objects.map((o) => o.title);
  // Track how many times each title appears
  const titleCount = new Map<string, number>();
  for (const t of rawTitles) {
    titleCount.set(t, (titleCount.get(t) ?? 0) + 1);
  }

  // Assign final titles: disambiguate duplicates with " 2", " 3", ...
  const titleUseCount = new Map<string, number>();
  const finalTitles: string[] = rawTitles.map((t) => {
    if ((titleCount.get(t) ?? 1) <= 1) return t;
    const n = (titleUseCount.get(t) ?? 0) + 1;
    titleUseCount.set(t, n);
    return n === 1 ? t : `${t} ${n}`;
  });

  // Build sourcePath → finalTitle and id → finalTitle lookups. Anytype links
  // reference targets either by filename (slug or CID) or by object id, so we
  // resolve against both.
  const refToTitle = new Map<string, string>();
  const idToTitle = new Map<string, string>();
  const titleToTitle = new Map<string, string>();
  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    if (obj) {
      const finalTitle = finalTitles[i] ?? obj.title;
      refToTitle.set(obj.sourcePath, finalTitle);
      if (obj.id) idToTitle.set(obj.id, finalTitle);
      titleToTitle.set(obj.title.toLowerCase(), finalTitle);
    }
  }

  // ── Step 2: sanitize + deduplicate filenames ───────────────────────────────
  const filenameCounts = new Map<string, number>();

  function allocateFilename(title: string): string {
    const safe = title.replace(/[/\\:*?"<>|]/g, '-') + '.md';
    const n = (filenameCounts.get(safe) ?? 0) + 1;
    filenameCounts.set(safe, n);
    if (n === 1) return safe;
    // Insert counter before extension: "Note.md" → "Note 2.md"
    return safe.replace(/\.md$/, ` ${n}.md`);
  }

  // ── Step 3 + 4 + 5: map each object ───────────────────────────────────────
  let totalTags = 0;
  let totalLinks = 0;
  let totalUnresolved = 0;
  let totalAttachments = 0;

  const notes: PreparedNote[] = [];

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    if (!obj) continue;
    const finalTitle = finalTitles[i] ?? obj.title;
    const relativePath = allocateFilename(finalTitle);

    // Tags: flatten tag/status relations, dedupe
    const tags: string[] = [];
    const extraRelations: Record<string, unknown> = {};
    for (const [key, values] of Object.entries(obj.relations)) {
      if (isTagRelation(key)) {
        for (const v of values) {
          const trimmed = v.trim();
          if (trimmed && !tags.includes(trimmed)) {
            tags.push(trimmed);
          }
        }
      } else {
        extraRelations[key] = values.length === 1 ? (values[0] ?? '') : values;
      }
    }
    totalTags += tags.length;
    totalAttachments += obj.attachments.length;

    // Replace markdown links with wikilinks
    let body = obj.body;

    for (const link of obj.links) {
      const decoded = decodeURIComponent(link.targetRef);
      // Try to resolve: match by full sourcePath, or by basename stem
      let resolvedTitle: string | undefined;

      // Exact match on sourcePath
      resolvedTitle = refToTitle.get(link.targetRef);

      if (!resolvedTitle) {
        // Try decoded path
        resolvedTitle = refToTitle.get(decoded);
      }

      if (!resolvedTitle) {
        // Try matching by basename stem (filename) or by object id (CID links).
        const stem = posixBasename(decoded, '.md');
        resolvedTitle = idToTitle.get(stem) ?? titleToTitle.get(stem.toLowerCase());
        if (!resolvedTitle) {
          for (const [srcPath, t] of refToTitle.entries()) {
            if (posixBasename(srcPath, '.md') === stem) {
              resolvedTitle = t;
              break;
            }
          }
        }
      }

      if (resolvedTitle) {
        const wikilink = link.relation
          ? `[[${resolvedTitle}||${link.relation}]]`
          : `[[${resolvedTitle}]]`;
        // Replace the specific markdown link in body
        const mdLink = `[${link.label ?? ''}](${link.targetRef})`;
        body = body.split(mdLink).join(wikilink);
        totalLinks++;
      } else {
        totalUnresolved++;
      }
    }

    // Build frontmatter (no id — writeNote assigns it)
    const fm: Frontmatter = {
      tags,
      ...extraRelations,
    };
    if (obj.emoji) fm.emoji = obj.emoji;
    if (obj.createdAt) fm.created = obj.createdAt;
    if (obj.modifiedAt) fm.modified = obj.modifiedAt;

    const content = serializeFrontmatter(fm, body);
    notes.push({ relativePath, content });
  }

  const summary: ImportSummary = {
    noteCount: notes.length,
    tagCount: totalTags,
    linkCount: totalLinks,
    unresolvedLinks: totalUnresolved,
    attachmentCount: totalAttachments,
  };

  return { notes, summary };
}

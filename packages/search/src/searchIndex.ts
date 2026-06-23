import lunr from 'lunr';
import type { NoteRecord, SearchResult } from '@notes-app/common';
import { SEARCH_SNIPPET_LENGTH } from '@notes-app/common';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SearchIndex {
  idx: lunr.Index;
  notes: Map<string, NoteRecord>;
}

// ─── Build ────────────────────────────────────────────────────────────────────

/**
 * Build a Lunr full-text index from the given notes.
 * Index is built over `title` (boosted 10×) and `bodyText`.
 */
export function buildIndex(notes: NoteRecord[]): SearchIndex {
  const noteMap = new Map(notes.map((n) => [n.id, n]));

  const idx = lunr(function () {
    this.ref('id');
    this.field('title', { boost: 10 });
    this.field('bodyText');

    for (const note of notes) {
      this.add({ id: note.id, title: note.title, bodyText: note.bodyText });
    }
  });

  return { idx, notes: noteMap };
}

// ─── Query ────────────────────────────────────────────────────────────────────

/**
 * Search the index. Each term gets a trailing wildcard so "foo" matches "foobar".
 * Returns results ordered by descending Lunr score.
 */
export function search(searchIdx: SearchIndex, rawQuery: string): SearchResult[] {
  const q = rawQuery.trim();
  if (!q) return [];

  // Append wildcard to every term for prefix matching
  const wildcardQuery = q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => `${t}*`)
    .join(' ');

  let lunrResults: lunr.Index.Result[];
  try {
    lunrResults = searchIdx.idx.search(wildcardQuery);
  } catch {
    // lunr throws on bad query syntax — return empty results
    return [];
  }

  return lunrResults.flatMap((r) => {
    const note = searchIdx.notes.get(r.ref);
    if (!note) return [];
    return [
      {
        noteId: note.id,
        title: note.title,
        snippet: makeSnippet(note.bodyText, q),
        score: r.score,
      },
    ];
  });
}

// ─── Snippet ──────────────────────────────────────────────────────────────────

/**
 * Extract a ~SEARCH_SNIPPET_LENGTH char excerpt from bodyText centered on the
 * first occurrence of the first query term. The matched term is wrapped in
 * `<mark>…</mark>`. Markdown syntax is stripped for display.
 */
export function makeSnippet(bodyText: string, query: string): string {
  const plain = stripMarkdown(bodyText);
  const term = (query.trim().split(/\s+/)[0] ?? '').toLowerCase();

  if (!term) return plain.slice(0, SEARCH_SNIPPET_LENGTH);

  const lower = plain.toLowerCase();
  const matchIdx = lower.indexOf(term);

  if (matchIdx === -1) {
    // Term not in body (may be a title-only match) — return the opening
    return plain.slice(0, SEARCH_SNIPPET_LENGTH) + (plain.length > SEARCH_SNIPPET_LENGTH ? '…' : '');
  }

  const half = Math.floor(SEARCH_SNIPPET_LENGTH / 2);
  const start = Math.max(0, matchIdx - half);
  const end = Math.min(plain.length, start + SEARCH_SNIPPET_LENGTH);
  const excerpt = plain.slice(start, end);

  // Wrap the matched term in <mark> (case-insensitive, first occurrence only)
  const termInExcerpt = excerpt.slice(matchIdx - start, matchIdx - start + term.length);
  const marked = excerpt.replace(termInExcerpt, `<mark>${termInExcerpt}</mark>`);

  return (start > 0 ? '…' : '') + marked + (end < plain.length ? '…' : '');
}

/**
 * Strip Markdown syntax from text, leaving readable plain text suitable for
 * snippet display. Does NOT strip from the Lunr index — only for presentation.
 */
export function stripMarkdown(text: string): string {
  return (
    text
      // Fenced code blocks
      .replace(/```[\s\S]*?```/g, '')
      // Inline code
      .replace(/`[^`\n]+`/g, '')
      // Wikilinks [[Title||type]] or [[Title]] → keep title
      .replace(/\[\[([^\]|]+)(?:\|\|[^\]]+)?\]\]/g, '$1')
      // Markdown links [text](url) → keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Heading markers at line start
      .replace(/^#{1,6}\s+/gm, '')
      // Horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, '')
      // Bold + italic (*** or ___)
      .replace(/\*{3}([^*]+)\*{3}/g, '$1')
      .replace(/_{3}([^_]+)_{3}/g, '$1')
      // Bold (** or __)
      .replace(/\*{2}([^*]+)\*{2}/g, '$1')
      .replace(/_{2}([^_]+)_{2}/g, '$1')
      // Italic (* or _)
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Blockquote markers
      .replace(/^>\s*/gm, '')
      // List markers
      .replace(/^[\s]*[-*+]\s+/gm, '')
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

// ─── Deserialise ─────────────────────────────────────────────────────────────

/**
 * Reconstruct a `SearchIndex` from a serialised lunr JSON blob (produced by
 * `idx.toJSON()` inside the index Web Worker) and the original records array.
 * Called on the main thread after the worker posts back the serialised index.
 */
export function loadIndexFromJson(records: NoteRecord[], idxJson: object): SearchIndex {
  return {
    idx: lunr.Index.load(idxJson),
    notes: new Map(records.map((n) => [n.id, n])),
  };
}

// ─── Tag helpers ──────────────────────────────────────────────────────────────

/** Return all distinct tags used across the vault, sorted alphabetically. */
export function getAllTags(notes: NoteRecord[]): string[] {
  const tagSet = new Set<string>();
  for (const note of notes) {
    for (const tag of note.tags) {
      tagSet.add(tag);
    }
  }
  return [...tagSet].sort();
}

/**
 * Return notes that have ALL of the given tags (AND logic).
 * If `tags` is empty, all notes are returned.
 */
export function filterByTags(notes: NoteRecord[], tags: string[]): NoteRecord[] {
  if (tags.length === 0) return notes;
  return notes.filter((n) => tags.every((t) => n.tags.includes(t)));
}

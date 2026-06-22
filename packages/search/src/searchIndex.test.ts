import { describe, it, expect } from 'vitest';
import type { NoteRecord } from '@notes-app/common';
import { buildIndex, search, makeSnippet, stripMarkdown, getAllTags, filterByTags } from './searchIndex.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNote(partial: Partial<NoteRecord> & { id: string; title: string }): NoteRecord {
  return {
    path: `${partial.title}.md`,
    emoji: null,
    tags: [],
    outlinks: [],
    modified: new Date('2024-01-01'),
    bodyText: '',
    ...partial,
  };
}

// ─── buildIndex / search ──────────────────────────────────────────────────────

describe('search()', () => {
  const notes: NoteRecord[] = [
    makeNote({ id: '1', title: 'TypeScript Tips', bodyText: 'Use strict mode and type guards.' }),
    makeNote({ id: '2', title: 'React Hooks', bodyText: 'useState and useEffect are the basics.' }),
    makeNote({ id: '3', title: 'CSS Grid', bodyText: 'Grid layout for two-dimensional designs.' }),
  ];
  const idx = buildIndex(notes);

  it('finds a note by exact body term', () => {
    const results = search(idx, 'strict');
    expect(results.map((r) => r.noteId)).toContain('1');
  });

  it('prefix (wildcard) match — "typ" matches "TypeScript"', () => {
    const results = search(idx, 'typ');
    expect(results.map((r) => r.noteId)).toContain('1');
  });

  it('case-insensitive — "REACT" matches "React Hooks"', () => {
    const results = search(idx, 'REACT');
    expect(results.map((r) => r.noteId)).toContain('2');
  });

  it('returns empty array for non-matching query', () => {
    const results = search(idx, 'zzznomatchzzz');
    expect(results).toHaveLength(0);
  });

  it('returns empty array for empty query', () => {
    expect(search(idx, '')).toHaveLength(0);
    expect(search(idx, '   ')).toHaveLength(0);
  });

  it('result contains noteId, title, snippet, score', () => {
    const [result] = search(idx, 'grid');
    expect(result).toBeDefined();
    expect(result!.noteId).toBe('3');
    expect(result!.title).toBe('CSS Grid');
    expect(typeof result!.snippet).toBe('string');
    expect(typeof result!.score).toBe('number');
  });
});

// ─── makeSnippet ──────────────────────────────────────────────────────────────

describe('makeSnippet()', () => {
  it('wraps matched term in <mark>', () => {
    const snippet = makeSnippet('The quick brown fox jumps over the lazy dog', 'fox');
    expect(snippet).toContain('<mark>fox</mark>');
  });

  it('contains exactly one <mark> tag', () => {
    const snippet = makeSnippet('foo bar foo baz', 'foo');
    const count = (snippet.match(/<mark>/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('snippet length is at most SEARCH_SNIPPET_LENGTH + ellipsis overhead', () => {
    const long = 'word '.repeat(200);
    const snippet = makeSnippet(long, 'word');
    // strip <mark> tags for length measurement
    const stripped = snippet.replace(/<\/?mark>/g, '').replace(/…/g, '');
    expect(stripped.length).toBeLessThanOrEqual(155);
  });

  it('returns opening text when term is not found', () => {
    const snippet = makeSnippet('Hello world', 'zzz');
    expect(snippet).toBe('Hello world');
  });

  it('handles empty query gracefully', () => {
    const snippet = makeSnippet('Hello world', '');
    expect(snippet).toBe('Hello world');
  });
});

// ─── stripMarkdown ────────────────────────────────────────────────────────────

describe('stripMarkdown()', () => {
  it('removes heading markers', () => {
    expect(stripMarkdown('# Title\n\nBody')).not.toContain('#');
  });

  it('removes bold markers', () => {
    const result = stripMarkdown('**bold text**');
    expect(result).toBe('bold text');
    expect(result).not.toContain('*');
  });

  it('removes italic markers', () => {
    expect(stripMarkdown('_italic_')).toBe('italic');
  });

  it('keeps wikilink display title', () => {
    expect(stripMarkdown('See [[Other Note||related]]')).toContain('Other Note');
    expect(stripMarkdown('See [[Other Note||related]]')).not.toContain('[[');
  });

  it('keeps markdown link text', () => {
    const result = stripMarkdown('[click here](https://example.com)');
    expect(result).toContain('click here');
    expect(result).not.toContain('https://');
  });

  it('strips inline code', () => {
    expect(stripMarkdown('Use `const x = 1` here')).not.toContain('`');
  });
});

// ─── getAllTags / filterByTags ─────────────────────────────────────────────────

describe('getAllTags()', () => {
  it('returns distinct tags sorted alphabetically', () => {
    const notes = [
      makeNote({ id: '1', title: 'A', tags: ['zig', 'alpha'] }),
      makeNote({ id: '2', title: 'B', tags: ['alpha', 'beta'] }),
    ];
    expect(getAllTags(notes)).toEqual(['alpha', 'beta', 'zig']);
  });

  it('returns empty array for tagless vault', () => {
    expect(getAllTags([makeNote({ id: '1', title: 'X' })])).toEqual([]);
  });
});

describe('filterByTags()', () => {
  const notes = [
    makeNote({ id: '1', title: 'A', tags: ['typescript', 'backend'] }),
    makeNote({ id: '2', title: 'B', tags: ['typescript', 'frontend'] }),
    makeNote({ id: '3', title: 'C', tags: ['rust'] }),
  ];

  it('returns all notes when tags list is empty', () => {
    expect(filterByTags(notes, [])).toHaveLength(3);
  });

  it('single tag filter', () => {
    const result = filterByTags(notes, ['typescript']);
    expect(result.map((n) => n.id)).toEqual(['1', '2']);
  });

  it('AND logic — both tags required', () => {
    const result = filterByTags(notes, ['typescript', 'backend']);
    expect(result.map((n) => n.id)).toEqual(['1']);
  });

  it('returns empty when no note matches', () => {
    expect(filterByTags(notes, ['haskell'])).toHaveLength(0);
  });
});

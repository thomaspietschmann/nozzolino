import { describe, it, expect } from 'vitest';
import { parseFrontmatter, parseWikiLinks } from '@notes-app/common';
import { mapObjects } from './mapAnytype.js';
import type { AnytypeObject } from './model.js';

function makeObj(overrides: Partial<AnytypeObject>): AnytypeObject {
  return {
    sourcePath: 'note.md',
    title: 'Note',
    body: '',
    relations: {},
    links: [],
    attachments: [],
    ...overrides,
  };
}

describe('mapObjects – tags', () => {
  it('flattens tag relation values into frontmatter tags', () => {
    const obj = makeObj({
      sourcePath: 'a.md',
      title: 'A',
      relations: { tags: ['alpha', 'beta'], category: ['concept'] },
    });
    const { notes } = mapObjects([obj]);
    const { frontmatter } = parseFrontmatter(notes[0]!.content);
    expect(frontmatter.tags).toEqual(['alpha', 'beta']);
  });

  it('deduplicates tags', () => {
    const obj = makeObj({
      sourcePath: 'a.md',
      title: 'A',
      relations: { tag: ['alpha', 'alpha', 'beta'] },
    });
    const { notes } = mapObjects([obj]);
    const { frontmatter } = parseFrontmatter(notes[0]!.content);
    expect(frontmatter.tags).toEqual(['alpha', 'beta']);
  });

  it('maps status relation to tags', () => {
    const obj = makeObj({
      sourcePath: 'a.md',
      title: 'A',
      relations: { status: ['active'] },
    });
    const { notes } = mapObjects([obj]);
    const { frontmatter } = parseFrontmatter(notes[0]!.content);
    expect(frontmatter.tags).toContain('active');
  });

  it('preserves non-tag relations as extra frontmatter', () => {
    const obj = makeObj({
      sourcePath: 'a.md',
      title: 'A',
      relations: { category: ['reference'], tags: ['t1'] },
    });
    const { notes } = mapObjects([obj]);
    const { frontmatter } = parseFrontmatter(notes[0]!.content);
    // category is extra frontmatter (single-value → scalar)
    expect(frontmatter['category']).toBe('reference');
    expect(frontmatter.tags).toEqual(['t1']);
  });

  it('summary tagCount is total tag assignments across all notes', () => {
    const objs = [
      makeObj({ sourcePath: 'a.md', title: 'A', relations: { tags: ['t1', 't2'] } }),
      makeObj({ sourcePath: 'b.md', title: 'B', relations: { tags: ['t3'] } }),
    ];
    const { summary } = mapObjects(objs);
    expect(summary.tagCount).toBe(3);
  });
});

describe('mapObjects – wikilinks', () => {
  it('replaces internal markdown link with [[Title]]', () => {
    const target = makeObj({
      sourcePath: 'target.md',
      title: 'Target Note',
      body: '',
    });
    const source = makeObj({
      sourcePath: 'source.md',
      title: 'Source Note',
      body: 'See [Target Note](target.md) for details.',
      links: [{ targetRef: 'target.md', label: 'Target Note' }],
    });
    const { notes } = mapObjects([target, source]);
    const sourceNote = notes.find((n) => n.relativePath === 'Source Note.md');
    const { body } = parseFrontmatter(sourceNote!.content);
    expect(body).toContain('[[Target Note]]');
    expect(body).not.toContain('[Target Note](target.md)');
  });

  it('replaces internal link with [[Title||relation]] when relation present', () => {
    const target = makeObj({ sourcePath: 'b.md', title: 'B' });
    const source = makeObj({
      sourcePath: 'a.md',
      title: 'A',
      body: '[B](b.md) is a dependency.',
      links: [{ targetRef: 'b.md', label: 'B', relation: 'depends-on' }],
    });
    const { notes } = mapObjects([target, source]);
    const n = notes.find((n) => n.relativePath === 'A.md');
    const { body } = parseFrontmatter(n!.content);
    expect(body).toContain('[[B||depends-on]]');
  });

  it('round-trips wikilinks through parseWikiLinks', () => {
    const target = makeObj({ sourcePath: 'b.md', title: 'B' });
    const source = makeObj({
      sourcePath: 'a.md',
      title: 'A',
      body: '[B](b.md)',
      links: [{ targetRef: 'b.md', label: 'B' }],
    });
    const { notes } = mapObjects([target, source]);
    const n = notes.find((n) => n.relativePath === 'A.md');
    const { body } = parseFrontmatter(n!.content);
    const outlinks = parseWikiLinks(body);
    expect(outlinks).toHaveLength(1);
    expect(outlinks[0]?.targetTitle).toBe('B');
    expect(outlinks[0]?.relationshipType).toBeNull();
  });

  it('round-trips typed wikilinks through parseWikiLinks', () => {
    const target = makeObj({ sourcePath: 'b.md', title: 'B' });
    const source = makeObj({
      sourcePath: 'a.md',
      title: 'A',
      body: '[B](b.md)',
      links: [{ targetRef: 'b.md', label: 'B', relation: 'related-to' }],
    });
    const { notes } = mapObjects([target, source]);
    const n = notes.find((n) => n.relativePath === 'A.md');
    const { body } = parseFrontmatter(n!.content);
    const outlinks = parseWikiLinks(body);
    expect(outlinks[0]?.relationshipType).toBe('related-to');
  });

  it('leaves unresolvable link unchanged and counts it', () => {
    const source = makeObj({
      sourcePath: 'a.md',
      title: 'A',
      body: 'See [External](https://example.com/note.md) note.',
      links: [{ targetRef: 'https://example.com/note.md', label: 'External' }],
    });
    const { notes, summary } = mapObjects([source]);
    const n = notes[0]!;
    const { body } = parseFrontmatter(n.content);
    expect(body).toContain('[External](https://example.com/note.md)');
    expect(summary.unresolvedLinks).toBe(1);
    expect(summary.linkCount).toBe(0);
  });
});

describe('mapObjects – title sanitization and collisions', () => {
  it('sanitizes forbidden characters in filename', () => {
    const obj = makeObj({ sourcePath: 'a.md', title: 'Note: With/Slash' });
    const { notes } = mapObjects([obj]);
    expect(notes[0]!.relativePath).toBe('Note- With-Slash.md');
  });

  it('handles title collisions by appending suffix', () => {
    const objs = [
      makeObj({ sourcePath: 'a.md', title: 'Same' }),
      makeObj({ sourcePath: 'b.md', title: 'Same' }),
    ];
    const { notes } = mapObjects(objs);
    const paths = notes.map((n) => n.relativePath);
    expect(paths).toContain('Same.md');
    expect(paths).toContain('Same 2.md');
  });

  it('deduplicates filename collisions even without title collision', () => {
    // Two notes with different titles but same sanitized filename
    const objs = [
      makeObj({ sourcePath: 'a.md', title: 'Note/A' }),
      makeObj({ sourcePath: 'b.md', title: 'Note:A' }),
    ];
    const { notes } = mapObjects(objs);
    const paths = notes.map((n) => n.relativePath);
    expect(new Set(paths).size).toBe(2);
  });
});

describe('mapObjects – summary counts', () => {
  it('counts attachments', () => {
    const obj = makeObj({
      sourcePath: 'a.md',
      title: 'A',
      attachments: [{ ref: 'files/img.png' }, { ref: 'files/doc.pdf' }],
    });
    const { summary } = mapObjects([obj]);
    expect(summary.attachmentCount).toBe(2);
  });

  it('counts noteCount', () => {
    const objs = [
      makeObj({ sourcePath: 'a.md', title: 'A' }),
      makeObj({ sourcePath: 'b.md', title: 'B' }),
      makeObj({ sourcePath: 'c.md', title: 'C' }),
    ];
    const { summary } = mapObjects(objs);
    expect(summary.noteCount).toBe(3);
  });
});

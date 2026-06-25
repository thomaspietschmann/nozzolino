import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '@notes-app/common';
import { MemoryImportSource } from './ImportSource.js';
import { prepareImport } from './prepareImport.js';

const SAMPLE_FILES: Record<string, string> = {
  'note-a.md': `---
tags:
  - alpha
  - beta
created: "2024-02-01T00:00:00Z"
---
# Note A

This links to [Note B](note-b.md).

![banner](files/banner.jpg)
`,
  'note-b.md': `---
tags:
  - gamma
category: reference
---
# Note B

Standalone content.
`,
  'note-c.md': `---
tags:
  - alpha
status: done
---
# Note C

Links to external [Resource](https://external.example/page.md).
`,
  'index.md': `# Index\n\nShould be skipped.\n`,
};

describe('prepareImport', () => {
  it('returns correct noteCount (skips index.md)', async () => {
    const source = new MemoryImportSource(SAMPLE_FILES);
    const { summary } = await prepareImport(source);
    expect(summary.noteCount).toBe(3);
  });

  it('counts total tag assignments across all notes', async () => {
    const source = new MemoryImportSource(SAMPLE_FILES);
    const { summary } = await prepareImport(source);
    // Note A: alpha, beta = 2; Note B: gamma = 1; Note C: alpha, done = 2 (status→tags)
    // total = 5
    expect(summary.tagCount).toBe(5);
  });

  it('counts resolved wikilinks', async () => {
    const source = new MemoryImportSource(SAMPLE_FILES);
    const { summary } = await prepareImport(source);
    // note-a.md links to note-b.md (resolvable) → 1 resolved
    expect(summary.linkCount).toBe(1);
  });

  it('counts unresolved links', async () => {
    const source = new MemoryImportSource(SAMPLE_FILES);
    const { summary } = await prepareImport(source);
    // note-c.md links to external .md (unresolvable) → 1 unresolved
    expect(summary.unresolvedLinks).toBe(1);
  });

  it('counts attachments (image, not written)', async () => {
    const source = new MemoryImportSource(SAMPLE_FILES);
    const { summary } = await prepareImport(source);
    // note-a.md has one image attachment
    expect(summary.attachmentCount).toBeGreaterThanOrEqual(1);
  });

  it('produces a valid serialized .md for Note A', async () => {
    const source = new MemoryImportSource(SAMPLE_FILES);
    const { notes } = await prepareImport(source);
    const noteA = notes.find((n) => n.relativePath === 'Note A.md');
    expect(noteA).toBeDefined();
    const { frontmatter, body } = parseFrontmatter(noteA!.content);
    expect(frontmatter.tags).toEqual(expect.arrayContaining(['alpha', 'beta']));
    expect(frontmatter.created).toBe('2024-02-01T00:00:00Z');
    // Internal link should be replaced with wikilink
    expect(body).toContain('[[Note B]]');
  });

  it('preserves non-tag relation as extra frontmatter field', async () => {
    const source = new MemoryImportSource(SAMPLE_FILES);
    const { notes } = await prepareImport(source);
    const noteB = notes.find((n) => n.relativePath === 'Note B.md');
    const { frontmatter } = parseFrontmatter(noteB!.content);
    expect(frontmatter['category']).toBe('reference');
  });

  it('does not include id in prepared content', async () => {
    const source = new MemoryImportSource(SAMPLE_FILES);
    const { notes } = await prepareImport(source);
    for (const note of notes) {
      const { frontmatter } = parseFrontmatter(note.content);
      expect(frontmatter.id).toBeUndefined();
    }
  });
});

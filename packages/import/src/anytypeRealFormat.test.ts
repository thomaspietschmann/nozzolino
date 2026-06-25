import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '@notes-app/common';
import { MemoryImportSource } from './ImportSource.js';
import { prepareImport } from './prepareImport.js';

// Replicates the real Anytype "Markdown export incl. linked content" format:
// a yaml-language-server comment, capitalised/spaced relation keys, Anytype-
// internal system relations, an emoji unicode escape, a bare `# ` heading for
// an untitled linked object, and a body link to a CID-named file.
const HOME = `---
# yaml-language-server: $schema=schemas/page.schema.json
Object type:
    - Page
Backlinks:
    - 'Some other note'
Creation date: "2026-06-17T16:15:15Z"
Created by:
    - Thomas P.
Links:
    - linked.md
Emoji: "\\U0001F3A0"
id: bafyhome
---
# Home Relaunch

Body text with a link [linked](linked.md)
`;

const LINKED = `---
# yaml-language-server: $schema=schemas/page.schema.json
Object type:
    - Page
Creation date: "2026-06-25T20:27:43Z"
id: bafylinked
---
#
`;

describe('real Anytype markdown export', () => {
  it('maps the real format cleanly', async () => {
    const source = new MemoryImportSource({ 'home.md': HOME, 'linked.md': LINKED });
    const { notes, summary } = await prepareImport(source);

    expect(summary.noteCount).toBe(2);
    expect(summary.linkCount).toBe(1);
    expect(summary.unresolvedLinks).toBe(0);

    const home = notes.find((n) => n.relativePath.startsWith('Home Relaunch'))!;
    const { frontmatter, body } = parseFrontmatter(home.content);

    // Emoji + creation date mapped to our fields.
    expect(frontmatter.emoji).toBe('🎠');
    expect(frontmatter.created).toBe('2026-06-17T16:15:15Z');
    expect(frontmatter.tags).toEqual([]);

    // Anytype-internal system relations are dropped, not written as frontmatter.
    expect(frontmatter['Object type']).toBeUndefined();
    expect(frontmatter['Backlinks']).toBeUndefined();
    expect(frontmatter['Links']).toBeUndefined();
    expect(frontmatter['Created by']).toBeUndefined();
    expect(frontmatter['id']).toBeUndefined();

    // Body link converted to a wikilink to the (untitled → stem-named) target.
    expect(body).toContain('[[linked]]');
    expect(body).not.toContain('](linked.md)');
  });

  it('falls back to the filename stem for an untitled (bare #) object', async () => {
    const source = new MemoryImportSource({ 'linked.md': LINKED });
    const { notes } = await prepareImport(source);
    expect(notes[0]!.relativePath).toBe('linked.md');
  });
});

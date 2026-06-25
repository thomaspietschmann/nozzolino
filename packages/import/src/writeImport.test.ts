import { describe, it, expect, vi } from 'vitest';
import { MemoryVaultFS, buildVaultIndex } from '@notes-app/vault';
import type { VaultOpsContext } from '@notes-app/vault';
import { parseFrontmatter } from '@notes-app/common';
import { MemoryImportSource } from './ImportSource.js';
import { prepareImport } from './prepareImport.js';
import { writeImport } from './writeImport.js';

const SAMPLE_FILES: Record<string, string> = {
  'note-x.md': `---
tags:
  - tagX
created: "2024-03-01T00:00:00Z"
---
# Note X

Links to [Note Y](note-y.md).
`,
  'note-y.md': `---
tags:
  - tagY
---
# Note Y

Standalone note.
`,
};

async function buildCtx(): Promise<{ vaultFS: MemoryVaultFS; ctx: VaultOpsContext }> {
  const vaultFS = new MemoryVaultFS();
  const index = await buildVaultIndex(vaultFS);
  let idCounter = 0;
  const ctx: VaultOpsContext = {
    vaultFS,
    index,
    generateId: () => `id-${++idCounter}`,
  };
  return { vaultFS, ctx };
}

describe('writeImport', () => {
  it('writes all notes to the vault', async () => {
    const { vaultFS, ctx } = await buildCtx();
    const source = new MemoryImportSource(SAMPLE_FILES);
    const { notes } = await prepareImport(source);
    await writeImport(ctx, notes);

    const files = vaultFS.getTextFiles();
    expect([...files.keys()]).toContain('Note X.md');
    expect([...files.keys()]).toContain('Note Y.md');
  });

  it('notes appear in the index with correct tags', async () => {
    const { ctx } = await buildCtx();
    const source = new MemoryImportSource(SAMPLE_FILES);
    const { notes } = await prepareImport(source);
    await writeImport(ctx, notes);

    const noteX = ctx.index.getNoteByTitle('Note X');
    expect(noteX).toBeDefined();
    expect(noteX?.tags).toEqual(expect.arrayContaining(['tagX']));

    const noteY = ctx.index.getNoteByTitle('Note Y');
    expect(noteY).toBeDefined();
    expect(noteY?.tags).toContain('tagY');
  });

  it('wikilinks are reflected as backlinks in the index', async () => {
    const { ctx } = await buildCtx();
    const source = new MemoryImportSource(SAMPLE_FILES);
    const { notes } = await prepareImport(source);
    await writeImport(ctx, notes);

    const noteY = ctx.index.getNoteByTitle('Note Y');
    expect(noteY).toBeDefined();
    const backlinks = ctx.index.getBacklinks(noteY!.id);
    const backlinkTitles = backlinks.map((n) => n.title);
    expect(backlinkTitles).toContain('Note X');
  });

  it('calls onProgress with (done, total) for each note', async () => {
    const { ctx } = await buildCtx();
    const source = new MemoryImportSource(SAMPLE_FILES);
    const { notes } = await prepareImport(source);
    const calls: Array<[number, number]> = [];
    await writeImport(ctx, notes, (done, total) => {
      calls.push([done, total]);
    });

    expect(calls).toHaveLength(notes.length);
    // Last call should be (total, total)
    const last = calls[calls.length - 1];
    expect(last).toEqual([notes.length, notes.length]);
    // First call should be (1, total)
    expect(calls[0]).toEqual([1, notes.length]);
  });

  it('calls onDidWrite for each note', async () => {
    const { ctx } = await buildCtx();
    const onDidWrite = vi.fn();
    ctx.onDidWrite = onDidWrite;
    const source = new MemoryImportSource(SAMPLE_FILES);
    const { notes } = await prepareImport(source);
    await writeImport(ctx, notes);

    expect(onDidWrite).toHaveBeenCalledTimes(notes.length);
  });

  it('preserves tags and created date in written content', async () => {
    const { vaultFS } = await buildCtx();
    const index = await buildVaultIndex(vaultFS);
    let idCounter = 0;
    const ctx: VaultOpsContext = { vaultFS, index, generateId: () => `id-${++idCounter}` };

    const source = new MemoryImportSource(SAMPLE_FILES);
    const { notes } = await prepareImport(source);
    await writeImport(ctx, notes);

    const content = await vaultFS.readFile('Note X.md');
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.tags).toContain('tagX');
    expect(frontmatter.created).toBe('2024-03-01T00:00:00Z');
  });
});

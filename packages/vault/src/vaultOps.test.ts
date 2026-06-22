import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '@notes-app/common';
import { MemoryVaultFS } from './MemoryVaultFS.js';
import { buildVaultIndex } from './VaultIndex.js';
import {
  writeNote,
  createNote,
  renameNote,
  propagateRename,
  updateFrontmatter,
  deleteNote,
  saveImage,
  type VaultOpsContext,
} from './vaultOps.js';

const FIXED_ID = '00000000-0000-0000-0000-000000000001';
let idCounter = 0;
const makeId = () => `test-id-${++idCounter}`;

async function makeCtx(vaultFS: MemoryVaultFS): Promise<VaultOpsContext> {
  const index = await buildVaultIndex(vaultFS);
  return { vaultFS, index, generateId: makeId };
}

describe('writeNote', () => {
  it('creates the file with frontmatter on first write', async () => {
    const fs = new MemoryVaultFS();
    const ctx = await makeCtx(fs);
    await writeNote(ctx, 'note.md', '# Hello\n\nworld\n');
    const files = fs.getTextFiles();
    expect(files.has('note.md')).toBe(true);
    const { frontmatter, body } = parseFrontmatter(files.get('note.md')!);
    expect(frontmatter.id).toBeDefined();
    expect(typeof frontmatter.created).toBe('string');
    expect(typeof frontmatter.modified).toBe('string');
    expect(body).toBe('# Hello\n\nworld\n');
  });

  it('preserves existing id and created on subsequent writes', async () => {
    const existing = `---\nid: ${FIXED_ID}\ntags: []\ncreated: "2024-01-01T00:00:00.000Z"\nmodified: "2024-01-01T00:00:00.000Z"\n---\n# Old\n\n`;
    const fs = new MemoryVaultFS();
    fs.seed('note.md', existing);
    const ctx = await makeCtx(fs);
    await writeNote(ctx, 'note.md', '# New\n\nupdated\n');
    const { frontmatter } = parseFrontmatter(fs.getTextFiles().get('note.md')!);
    expect(frontmatter.id).toBe(FIXED_ID);
    expect(frontmatter.created).toBe('2024-01-01T00:00:00.000Z');
  });

  it('refreshes the index after write', async () => {
    const fs = new MemoryVaultFS();
    const ctx = await makeCtx(fs);
    await writeNote(ctx, 'note.md', '# Hello\n\nworld\n');
    const record = ctx.index.getNoteByTitle('note');
    expect(record).toBeDefined();
    expect(record?.path).toBe('note.md');
  });
});

describe('createNote', () => {
  it('creates a .md file with frontmatter and a heading', async () => {
    const fs = new MemoryVaultFS();
    const ctx = await makeCtx(fs);
    const record = await createNote(ctx, 'My Note');
    expect(fs.getTextFiles().has('My Note.md')).toBe(true);
    const content = fs.getTextFiles().get('My Note.md')!;
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter.id).toBeDefined();
    expect(frontmatter.tags).toEqual([]);
    expect(body).toContain('# My Note');
    expect(record.title).toBe('My Note');
  });

  it('sanitizes title characters in filename', async () => {
    const fs = new MemoryVaultFS();
    const ctx = await makeCtx(fs);
    await createNote(ctx, 'bad/chars:here');
    expect(fs.getTextFiles().has('bad-chars-here.md')).toBe(true);
  });
});

describe('renameNote + propagateRename', () => {
  it('renames the file and rewrites inbound wikilinks', async () => {
    // Filename stem must match the wikilink text exactly (case-insensitive)
    const oldContent = `---\nid: id-old\ntags: []\n---\n# Alpha\n\n`;
    const linkerContent = `---\nid: id-linker\ntags: []\n---\n# Linker\n\nSee [[Alpha]] for details.\n`;
    const fs = new MemoryVaultFS();
    fs.seed('Alpha.md', oldContent);
    fs.seed('linker.md', linkerContent);
    const ctx = await makeCtx(fs);

    const { renamed, propagated } = await renameNote(ctx, 'Alpha.md', 'Beta');
    expect(renamed.title).toBe('Beta');
    expect(renamed.path).toBe('Beta.md');
    expect(fs.getTextFiles().has('Beta.md')).toBe(true);
    expect(fs.getTextFiles().has('Alpha.md')).toBe(false);

    expect(propagated).toHaveLength(1);
    expect(propagated[0]?.path).toBe('linker.md');
    const updatedLinker = fs.getTextFiles().get('linker.md')!;
    expect(updatedLinker).toContain('[[Beta]]');
    expect(updatedLinker).not.toContain('[[Alpha]]');
  });

  it('propagateRename does nothing when no notes link to the old title', async () => {
    const fs = new MemoryVaultFS();
    fs.seed('note.md', `---\nid: id-1\ntags: []\n---\n# Note\n\nNo links here.\n`);
    const ctx = await makeCtx(fs);
    const propagated = await propagateRename(ctx, 'Ghost', 'Phantom');
    expect(propagated).toHaveLength(0);
  });
});

describe('updateFrontmatter', () => {
  it('patches tags without touching the body', async () => {
    const original = `---\nid: ${FIXED_ID}\ntags: []\n---\n# Title\n\nBody text.\n`;
    const fs = new MemoryVaultFS();
    fs.seed('note.md', original);
    const ctx = await makeCtx(fs);
    const record = await updateFrontmatter(ctx, 'note.md', { tags: ['a', 'b'] });
    expect(record.tags).toEqual(['a', 'b']);
    const { frontmatter, body } = parseFrontmatter(fs.getTextFiles().get('note.md')!);
    expect(frontmatter.tags).toEqual(['a', 'b']);
    expect(body).toBe('# Title\n\nBody text.\n');
  });

  it('patches emoji', async () => {
    const original = `---\nid: ${FIXED_ID}\ntags: []\n---\n# Title\n\n`;
    const fs = new MemoryVaultFS();
    fs.seed('note.md', original);
    const ctx = await makeCtx(fs);
    const record = await updateFrontmatter(ctx, 'note.md', { emoji: '🌟' });
    expect(record.emoji).toBe('🌟');
  });
});

describe('deleteNote', () => {
  it('removes the file and evicts from index', async () => {
    const fs = new MemoryVaultFS();
    fs.seed('note.md', `---\nid: id-del\ntags: []\n---\n# Del\n\n`);
    const ctx = await makeCtx(fs);
    expect(ctx.index.getNoteByTitle('note')).toBeDefined();
    await deleteNote(ctx, 'note.md');
    expect(fs.getTextFiles().has('note.md')).toBe(false);
    expect(ctx.index.getNoteByTitle('note')).toBeUndefined();
  });
});

describe('saveImage', () => {
  it('stores binary file in sibling folder and returns relative path', async () => {
    const fs = new MemoryVaultFS();
    const ctx = await makeCtx(fs);
    const relPath = await saveImage(ctx, 'abc123', 'png', 'note.md');
    expect(relPath.startsWith('note/')).toBe(true);
    expect(relPath.endsWith('.png')).toBe(true);
    const bins = fs.getBinaryFiles();
    expect(bins.has(relPath)).toBe(true);
    expect(bins.get(relPath)).toBe('abc123');
  });

  it('respects subdirectory of the active note', async () => {
    const fs = new MemoryVaultFS();
    const ctx = await makeCtx(fs);
    const relPath = await saveImage(ctx, 'data', 'jpg', 'projects/meeting.md');
    expect(relPath.startsWith('projects/meeting/')).toBe(true);
  });
});

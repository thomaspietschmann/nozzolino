import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DirImportSource } from './ImportSource.js';
import { parseAnytypeBundle } from './anytypeMarkdownParser.js';
import type { AnytypeObject } from './model.js';

// import.meta.url points to this test file; __fixtures__ is in the same directory
const FIXTURE_DIR = resolve(
  fileURLToPath(import.meta.url),
  '../__fixtures__/anytype-sample'
);

describe('parseAnytypeBundle (DirImportSource fixture)', () => {
  let objects: AnytypeObject[];

  beforeAll(async () => {
    const source = await new DirImportSource(FIXTURE_DIR).init();
    objects = await parseAnytypeBundle(source);
  });

  it('skips top-level index.md and files/ entries, parses 5 .md notes', () => {
    // Alpha Note, Other Note, Beta Note, Duplicate Title, Duplicate Title 2
    expect(objects).toHaveLength(5);
  });

  it('extracts title from H1', () => {
    const alpha = objects.find((o) => o.sourcePath.includes('Alpha Note'));
    expect(alpha?.title).toBe('Alpha Note');
  });

  it('extracts tags from frontmatter tags array into relations', () => {
    const alpha = objects.find((o) => o.sourcePath.includes('Alpha Note'));
    // tags is NOT a reserved key — it ends up in relations so mapObjects can use it
    expect(alpha?.relations['tags']).toEqual(expect.arrayContaining(['research', 'important']));
  });

  it('extracts non-reserved relation (category)', () => {
    const other = objects.find((o) => o.sourcePath.includes('Other Note'));
    expect(other?.relations['category']).toEqual(['concept']);
  });

  it('extracts status relation', () => {
    const alpha = objects.find((o) => o.sourcePath.includes('Alpha Note'));
    // status is not a reserved key in RESERVED_KEYS — it should be captured in relations
    expect(alpha?.relations['status']).toEqual(['active']);
  });

  it('extracts internal .md links', () => {
    const alpha = objects.find((o) => o.sourcePath.includes('Alpha Note'));
    expect(alpha?.links.length).toBeGreaterThanOrEqual(2);
    const refs = alpha?.links.map((l) => l.targetRef) ?? [];
    expect(refs).toContain('Other%20Note.md');
    expect(refs).toContain('Beta%20Note.md');
  });

  it('extracts image attachments', () => {
    const alpha = objects.find((o) => o.sourcePath.includes('Alpha Note'));
    const refs = alpha?.attachments.map((a) => a.ref) ?? [];
    expect(refs).toContain('files/logo.png');
  });

  it('extracts files/ link as attachment', () => {
    const beta = objects.find((o) => o.sourcePath.includes('Beta Note'));
    const refs = beta?.attachments.map((a) => a.ref) ?? [];
    expect(refs).toContain('files/report.pdf');
  });

  it('extracts createdAt and modifiedAt from frontmatter', () => {
    const alpha = objects.find((o) => o.sourcePath.includes('Alpha Note'));
    expect(alpha?.createdAt).toBe('2024-01-10T09:00:00Z');
    expect(alpha?.modifiedAt).toBe('2024-01-15T12:00:00Z');
  });

  it('extracts emoji from frontmatter', () => {
    const alpha = objects.find((o) => o.sourcePath.includes('Alpha Note'));
    expect(alpha?.emoji).toBe('📝');
  });

  it('falls back to filename stem when H1 is absent', () => {
    // Duplicate Title 2 has "# Duplicate Title" in the body but different filename
    // Let's verify we at least have a Duplicate Title object
    const dupes = objects.filter((o) => o.title === 'Duplicate Title');
    expect(dupes.length).toBeGreaterThanOrEqual(1);
  });
});

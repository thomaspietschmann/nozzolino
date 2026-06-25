import { describe, it, expect, beforeAll } from 'vitest';
import JSZip from 'jszip';
import { MemoryImportSource } from './ImportSource.js';
import { ZipImportSource } from './ZipImportSource.js';

const FILE_MAP: Record<string, string> = {
  'note-a.md': '# Note A\n\nContent of A.',
  'note-b.md': '# Note B\n\nContent of B.',
  'subdir/note-c.md': '# Note C\n\nContent of C.',
};

async function buildZipBuffer(): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(FILE_MAP)) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: 'uint8array' });
}

describe('ZipImportSource', () => {
  let zipSource: ZipImportSource;
  let memSource: MemoryImportSource;

  beforeAll(async () => {
    const buf = await buildZipBuffer();
    zipSource = await ZipImportSource.fromBuffer(buf);
    memSource = new MemoryImportSource(FILE_MAP);
  });

  it('list() returns the same paths as MemoryImportSource', () => {
    const zipPaths = [...zipSource.list()].sort();
    const memPaths = [...memSource.list()].sort();
    expect(zipPaths).toEqual(memPaths);
  });

  it('readText() returns the same content as MemoryImportSource', async () => {
    for (const path of Object.keys(FILE_MAP)) {
      const zipContent = await zipSource.readText(path);
      const memContent = await memSource.readText(path);
      expect(zipContent).toBe(memContent);
    }
  });

  it('readBinary() decodes to matching UTF-8 string', async () => {
    const path = 'note-a.md';
    const bytes = await zipSource.readBinary(path);
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toBe(FILE_MAP[path]);
  });

  it('throws for missing entry', async () => {
    await expect(zipSource.readText('does-not-exist.md')).rejects.toThrow();
  });

  it('list() does not include directory entries', () => {
    const paths = zipSource.list();
    expect(paths.every((p) => !p.endsWith('/'))).toBe(true);
  });
});

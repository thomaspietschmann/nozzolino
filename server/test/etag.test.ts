import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeEtag } from '../src/etag';
import { FileStore } from '../src/store';

describe('computeEtag', () => {
  it('is deterministic and 16 hex chars', () => {
    const a = computeEtag('hello world');
    const b = computeEtag(Buffer.from('hello world'));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('differs for different content', () => {
    expect(computeEtag('a')).not.toBe(computeEtag('b'));
  });
});

describe('FileStore sidecars', () => {
  let dir: string;
  let store: FileStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'srv-etag-'));
    store = new FileStore(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('lazily computes a sidecar for files dropped into the volume', async () => {
    await writeFile(join(dir, 'note.md'), 'dropped in out of band');
    const etag = await store.etagFor('note.md');
    expect(etag).toBe(computeEtag('dropped in out of band'));
    // Sidecar should now exist under .meta.
    const side = JSON.parse(await readFile(join(dir, '.meta', 'note.md.json'), 'utf8'));
    expect(side.etag).toBe(etag);
  });

  it('refreshes the sidecar when mtime changes', async () => {
    await store.write('a.md', Buffer.from('v1'));
    const e1 = await store.etagFor('a.md');
    // Overwrite out of band with new content + advance mtime.
    await new Promise((r) => setTimeout(r, 10));
    await writeFile(join(dir, 'a.md'), 'v2 content');
    const e2 = await store.etagFor('a.md');
    expect(e2).toBe(computeEtag('v2 content'));
    expect(e2).not.toBe(e1);
  });

  it('keeps nested .meta layout mirroring the vault', async () => {
    await mkdir(join(dir, 'projects'), { recursive: true });
    await store.write('projects/x.md', Buffer.from('nested'));
    const side = JSON.parse(
      await readFile(join(dir, '.meta', 'projects', 'x.md.json'), 'utf8'),
    );
    expect(side.etag).toBe(computeEtag('nested'));
  });
});

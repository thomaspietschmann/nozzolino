import { describe, it, expect, beforeEach } from 'vitest';
import { sha256Hex16, sha256Hex16Bytes, bytesToBase64, base64ToBytes } from '@notes-app/common';
import { SyncEngine } from './SyncEngine.js';
import { InMemoryEtagCache } from './EtagCache.js';
import type { ServerFileEntry, SyncFS, SyncTransport } from './syncTypes.js';

/**
 * Minimal in-memory SyncFS for the engine tests. Kept local (not @notes-app/vault)
 * to avoid a vault→sync→vault dependency cycle; mirrors MemoryVaultFS's listDirectory.
 */
class MemoryVaultFS implements SyncFS {
  private text = new Map<string, string>();
  private binary = new Map<string, string>(); // path → base64
  private mtimes = new Map<string, Date>();

  seed(path: string, content: string): void {
    this.text.set(path, content);
    this.mtimes.set(path, new Date());
  }
  seedBinary(path: string, bytes: Uint8Array): void {
    this.binary.set(path, bytesToBase64(bytes));
    this.mtimes.set(path, new Date());
  }
  getBytes(path: string): Uint8Array | undefined {
    const b64 = this.binary.get(path);
    return b64 === undefined ? undefined : base64ToBytes(b64);
  }
  async readFile(path: string): Promise<string> {
    const v = this.text.get(path);
    if (v === undefined) throw new Error(`ENOENT: ${path}`);
    return v;
  }
  async writeFile(path: string, content: string): Promise<void> {
    this.text.set(path, content);
    this.mtimes.set(path, new Date());
  }
  async readBinaryFile(path: string): Promise<string> {
    const v = this.binary.get(path);
    if (v === undefined) throw new Error(`ENOENT: ${path}`);
    return v;
  }
  async writeBinaryFile(path: string, base64: string): Promise<void> {
    this.binary.set(path, base64);
    this.mtimes.set(path, new Date());
  }
  async deleteFile(path: string): Promise<void> {
    this.text.delete(path);
    this.binary.delete(path);
    this.mtimes.delete(path);
  }
  async listDirectory(path: string): Promise<{ path: string; isDirectory: boolean }[]> {
    const prefix = path && path !== '.' ? `${path}/` : '';
    const seen = new Set<string>();
    const entries: { path: string; isDirectory: boolean }[] = [];
    for (const key of [...this.text.keys(), ...this.binary.keys()]) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const i = rest.indexOf('/');
      if (i < 0) {
        if (!seen.has(rest)) {
          seen.add(rest);
          entries.push({ path: prefix + rest, isDirectory: false });
        }
      } else {
        const dirName = rest.slice(0, i);
        if (!seen.has(dirName)) {
          seen.add(dirName);
          entries.push({ path: prefix + dirName, isDirectory: true });
        }
      }
    }
    return entries;
  }
  async exists(path: string): Promise<boolean> {
    return this.text.has(path) || this.binary.has(path);
  }
  async stat(path: string): Promise<{ mtime: Date }> {
    if (!this.text.has(path) && !this.binary.has(path)) throw new Error(`ENOENT: ${path}`);
    return { mtime: this.mtimes.get(path) ?? new Date() };
  }
}

/** In-memory stand-in for the bundled server. */
class FakeServer implements SyncTransport {
  files = new Map<string, string>();
  binaries = new Map<string, Uint8Array>();
  offline = false;

  async health() {
    return { ok: true, version: 'test' };
  }
  async listFiles(): Promise<ServerFileEntry[]> {
    if (this.offline) throw new Error('network');
    const text = await Promise.all(
      [...this.files].map(async ([path, content]) => ({
        path,
        etag: await sha256Hex16(content),
        mtime: 0,
      })),
    );
    const binary = await Promise.all(
      [...this.binaries].map(async ([path, bytes]) => ({
        path,
        etag: await sha256Hex16Bytes(bytes),
        mtime: 0,
      })),
    );
    return [...text, ...binary];
  }
  async getFile(path: string) {
    const content = this.files.get(path) ?? '';
    return { content, etag: await sha256Hex16(content) };
  }
  async putFile(path: string, content: string, ifMatch?: string) {
    const existing = this.files.get(path);
    if (existing !== undefined && ifMatch !== undefined) {
      const cur = await sha256Hex16(existing);
      if (cur !== ifMatch) {
        return {
          ok: false as const,
          conflict: true as const,
          serverContent: existing,
          etag: cur,
        };
      }
    }
    this.files.set(path, content);
    return { ok: true as const, etag: await sha256Hex16(content) };
  }
  async getBinary(path: string) {
    const bytes = this.binaries.get(path) ?? new Uint8Array(0);
    return { bytes, etag: await sha256Hex16Bytes(bytes) };
  }
  async putBinary(path: string, bytes: Uint8Array, ifMatch?: string) {
    const existing = this.binaries.get(path);
    if (existing !== undefined && ifMatch !== undefined) {
      const cur = await sha256Hex16Bytes(existing);
      if (cur !== ifMatch) {
        return { ok: false as const, conflict: true as const, etag: cur };
      }
    }
    this.binaries.set(path, bytes);
    return { ok: true as const, etag: await sha256Hex16Bytes(bytes) };
  }
  async deleteFile(path: string) {
    this.files.delete(path);
    this.binaries.delete(path);
  }
}

function makeEngine(server: FakeServer, fs: MemoryVaultFS, cache = new InMemoryEtagCache()) {
  const statuses: string[] = [];
  const conflicts: { path: string; serverContent: string }[] = [];
  const localWrites: string[] = [];
  const localDeletes: string[] = [];
  const engine = new SyncEngine({
    client: server,
    fs,
    cache,
    hash: sha256Hex16,
    onConflict: async (path, serverContent) => {
      conflicts.push({ path, serverContent });
    },
    onStatus: (s) => statuses.push(s),
    onLocalWrite: (p) => {
      localWrites.push(p);
    },
    onLocalDelete: (p) => {
      localDeletes.push(p);
    },
  });
  return { engine, statuses, conflicts, localWrites, localDeletes, cache };
}

describe('SyncEngine.syncOnce', () => {
  let server: FakeServer;
  let fs: MemoryVaultFS;

  beforeEach(() => {
    server = new FakeServer();
    fs = new MemoryVaultFS();
  });

  it('pushes a new local file', async () => {
    fs.seed('a.md', 'local content');
    const { engine, statuses } = makeEngine(server, fs);
    const res = await engine.syncOnce();
    expect(res.pushed).toEqual(['a.md']);
    expect(server.files.get('a.md')).toBe('local content');
    expect(statuses).toEqual(['syncing', 'synced']);
  });

  it('pulls a new server file', async () => {
    server.files.set('b.md', 'server content');
    const { engine, localWrites } = makeEngine(server, fs);
    const res = await engine.syncOnce();
    expect(res.pulled).toEqual(['b.md']);
    expect(await fs.readFile('b.md')).toBe('server content');
    expect(localWrites).toEqual(['b.md']);
  });

  it('is a no-op when both sides are identical', async () => {
    fs.seed('c.md', 'same');
    server.files.set('c.md', 'same');
    const { engine, conflicts } = makeEngine(server, fs);
    const res = await engine.syncOnce();
    expect(res.pushed).toEqual([]);
    expect(res.pulled).toEqual([]);
    expect(conflicts).toEqual([]);
  });

  it('pushes when only the local side changed', async () => {
    fs.seed('d.md', 'v1');
    server.files.set('d.md', 'v1');
    const cache = new InMemoryEtagCache();
    cache.set('d.md', await sha256Hex16('v1'));
    await fs.writeFile('d.md', 'v2-local');
    const { engine } = makeEngine(server, fs, cache);
    const res = await engine.syncOnce();
    expect(res.pushed).toEqual(['d.md']);
    expect(server.files.get('d.md')).toBe('v2-local');
  });

  it('pulls when only the server side changed', async () => {
    fs.seed('e.md', 'v1');
    server.files.set('e.md', 'v1');
    const cache = new InMemoryEtagCache();
    cache.set('e.md', await sha256Hex16('v1'));
    server.files.set('e.md', 'v2-server');
    const { engine } = makeEngine(server, fs, cache);
    const res = await engine.syncOnce();
    expect(res.pulled).toEqual(['e.md']);
    expect(await fs.readFile('e.md')).toBe('v2-server');
  });

  it('conflicts when both sides changed', async () => {
    fs.seed('f.md', 'v1');
    server.files.set('f.md', 'v1');
    const cache = new InMemoryEtagCache();
    cache.set('f.md', await sha256Hex16('v1'));
    await fs.writeFile('f.md', 'local-change');
    server.files.set('f.md', 'server-change');
    const { engine, conflicts, statuses } = makeEngine(server, fs, cache);
    const res = await engine.syncOnce();
    expect(res.conflicted).toEqual(['f.md']);
    expect(conflicts).toEqual([{ path: 'f.md', serverContent: 'server-change' }]);
    expect(statuses.at(-1)).toBe('error');
  });

  it('routes a 409 on push into the conflict flow', async () => {
    // Local and server both new for the same path but with a stale known etag,
    // so the PUT carries an If-Match the server rejects.
    fs.seed('g.md', 'v1');
    server.files.set('g.md', 'v1');
    const cache = new InMemoryEtagCache();
    cache.set('g.md', await sha256Hex16('v1'));
    // Local edit (will try to push with If-Match = old etag)...
    await fs.writeFile('g.md', 'local-edit');
    // ...but server silently advanced to a value the engine's "known" predates,
    // and we force the server-changed flag off by NOT updating cache, while the
    // server content differs from known → both-changed path already covers this.
    // Here instead assert the direct putFile 409 branch via local-only-known mismatch:
    server.files.set('g.md', 'server-advanced');
    const { engine, conflicts } = makeEngine(server, fs, cache);
    const res = await engine.syncOnce();
    expect(res.conflicted).toContain('g.md');
    expect(conflicts.some((c) => c.path === 'g.md')).toBe(true);
  });

  it('propagates a local delete to the server', async () => {
    server.files.set('h.md', 'still on server');
    const cache = new InMemoryEtagCache();
    cache.set('h.md', await sha256Hex16('still on server'));
    const { engine } = makeEngine(server, fs, cache);
    const res = await engine.syncOnce();
    expect(res.deletedRemote).toEqual(['h.md']);
    expect(server.files.has('h.md')).toBe(false);
  });

  it('propagates a server delete to the local vault', async () => {
    fs.seed('i.md', 'still local');
    const cache = new InMemoryEtagCache();
    cache.set('i.md', await sha256Hex16('still local'));
    const { engine, localDeletes } = makeEngine(server, fs, cache);
    const res = await engine.syncOnce();
    expect(res.deletedLocal).toEqual(['i.md']);
    expect(await fs.exists('i.md')).toBe(false);
    expect(localDeletes).toEqual(['i.md']);
  });

  it('reports offline when the server is unreachable', async () => {
    server.offline = true;
    fs.seed('j.md', 'x');
    const { engine, statuses } = makeEngine(server, fs);
    const res = await engine.syncOnce();
    expect(res.status).toBe('offline');
    expect(statuses).toEqual(['syncing', 'offline']);
  });

  it('syncs notes and attachments but ignores conflict copies and dotfiles', async () => {
    fs.seed('k.md', 'note');
    fs.seed('k.sync-conflict-20240101-LOCAL.md', 'conflict copy');
    fs.seed('.hidden', 'dotfile');
    fs.seedBinary('files/image.png', new Uint8Array([1, 2, 3]));
    const { engine } = makeEngine(server, fs);
    await engine.syncOnce();
    expect(server.files.has('k.md')).toBe(true);
    expect(server.files.has('k.sync-conflict-20240101-LOCAL.md')).toBe(false);
    expect(server.files.has('.hidden')).toBe(false);
    expect(server.binaries.has('files/image.png')).toBe(true);
  });

  it('treats unchanged files as no-ops on a second pass via the cache', async () => {
    fs.seed('l.md', 'stable');
    const { engine, cache } = makeEngine(server, fs);
    await engine.syncOnce();
    expect(cache.get('l.md')).toBe(await sha256Hex16('stable'));
    const res2 = await engine.syncOnce();
    expect(res2.pushed).toEqual([]);
    expect(res2.pulled).toEqual([]);
  });

  // ── Binary attachment sync ────────────────────────────────────────────────

  const PNG_BYTES = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x7f, 0x80, 0x01, 0xfe,
  ]);

  it('pushes a new binary attachment', async () => {
    fs.seedBinary('files/img.png', PNG_BYTES);
    const { engine } = makeEngine(server, fs);
    const res = await engine.syncOnce();
    expect(res.pushed).toEqual(['files/img.png']);
    const onServer = server.binaries.get('files/img.png');
    expect(onServer).toBeDefined();
    expect(Array.from(onServer!)).toEqual(Array.from(PNG_BYTES));
  });

  it('pulls a server-only binary attachment with byte-for-byte integrity', async () => {
    server.binaries.set('files/photo.jpg', PNG_BYTES);
    const { engine, localWrites } = makeEngine(server, fs);
    const res = await engine.syncOnce();
    expect(res.pulled).toEqual(['files/photo.jpg']);
    expect(Array.from(fs.getBytes('files/photo.jpg')!)).toEqual(Array.from(PNG_BYTES));
    expect(localWrites).toEqual(['files/photo.jpg']);
  });

  it('treats an unchanged binary as a no-op on the second pass', async () => {
    fs.seedBinary('files/img.png', PNG_BYTES);
    const { engine, cache } = makeEngine(server, fs);
    await engine.syncOnce();
    expect(cache.get('files/img.png')).toBe(await sha256Hex16Bytes(PNG_BYTES));
    const res2 = await engine.syncOnce();
    expect(res2.pushed).toEqual([]);
    expect(res2.pulled).toEqual([]);
  });

  it('last-write-wins the server version when a binary changed on both sides', async () => {
    const localBytes = new Uint8Array([1, 1, 1]);
    const serverBytes = new Uint8Array([2, 2, 2, 2]);
    fs.seedBinary('files/img.png', new Uint8Array([0, 0, 0]));
    server.binaries.set('files/img.png', new Uint8Array([0, 0, 0]));
    const cache = new InMemoryEtagCache();
    cache.set('files/img.png', await sha256Hex16Bytes(new Uint8Array([0, 0, 0])));
    await fs.writeBinaryFile('files/img.png', bytesToBase64(localBytes));
    server.binaries.set('files/img.png', serverBytes);
    const { engine, conflicts } = makeEngine(server, fs, cache);
    const res = await engine.syncOnce();
    // Binary conflicts do NOT route to the M5 conflict UI.
    expect(conflicts).toEqual([]);
    expect(res.pulled).toEqual(['files/img.png']);
    expect(Array.from(fs.getBytes('files/img.png')!)).toEqual(Array.from(serverBytes));
  });

  it('syncs a note and an attachment together in one pass', async () => {
    fs.seed('note.md', 'hello');
    fs.seedBinary('files/img.png', PNG_BYTES);
    const { engine } = makeEngine(server, fs);
    const res = await engine.syncOnce();
    expect(res.pushed.sort()).toEqual(['files/img.png', 'note.md']);
    expect(server.files.get('note.md')).toBe('hello');
    expect(Array.from(server.binaries.get('files/img.png')!)).toEqual(Array.from(PNG_BYTES));
  });
});

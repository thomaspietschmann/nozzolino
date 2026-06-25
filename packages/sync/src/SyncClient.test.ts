import { describe, it, expect } from 'vitest';
import { SyncClient, SyncError } from './SyncClient.js';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('SyncClient', () => {
  it('sends the bearer token on authed requests', async () => {
    let seen: RequestInit | undefined;
    const client = new SyncClient('http://h:8080', 'tok', async (_url, init) => {
      seen = init;
      return jsonResponse([]);
    });
    await client.listFiles();
    expect((seen?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('does not require auth headers for health', async () => {
    const client = new SyncClient('http://h:8080/', 'tok', async (url) => {
      expect(url).toBe('http://h:8080/api/health');
      return jsonResponse({ ok: true, version: '1' });
    });
    const res = await client.health();
    expect(res.ok).toBe(true);
  });

  it('encodes path segments but keeps slashes', async () => {
    let calledUrl = '';
    const client = new SyncClient('http://h', 'tok', async (url) => {
      calledUrl = url;
      return new Response('content', { status: 200, headers: { ETag: 'abc' } });
    });
    const res = await client.getFile('projects/my note.md');
    expect(calledUrl).toBe('http://h/api/files/projects/my%20note.md');
    expect(res.content).toBe('content');
    expect(res.etag).toBe('abc');
  });

  it('sends If-Match on putFile and returns the new etag', async () => {
    let seen: RequestInit | undefined;
    const client = new SyncClient('http://h', 'tok', async (_url, init) => {
      seen = init;
      return jsonResponse({ path: 'a.md', etag: 'newetag' });
    });
    const res = await client.putFile('a.md', 'body', 'oldetag');
    expect((seen?.headers as Record<string, string>)['If-Match']).toBe('oldetag');
    expect(res).toEqual({ ok: true, etag: 'newetag' });
  });

  it('returns conflict payload on 409', async () => {
    const client = new SyncClient('http://h', 'tok', async () => {
      return new Response('server wins', { status: 409, headers: { ETag: 'srvtag' } });
    });
    const res = await client.putFile('a.md', 'mine', 'stale');
    expect(res).toEqual({
      ok: false,
      conflict: true,
      serverContent: 'server wins',
      etag: 'srvtag',
    });
  });

  it('throws SyncError with status on a server error', async () => {
    const client = new SyncClient('http://h', 'tok', async () => new Response('', { status: 500 }));
    await expect(client.listFiles()).rejects.toBeInstanceOf(SyncError);
  });

  it('treats a 404 delete as success (idempotent)', async () => {
    const client = new SyncClient('http://h', 'tok', async () => new Response('', { status: 404 }));
    await expect(client.deleteFile('gone.md')).resolves.toBeUndefined();
  });
});

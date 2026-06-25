import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app';
import { computeEtag } from '../src/etag';

const TOKEN = 'secret-token';
const AUTH = `Bearer ${TOKEN}`;

describe('/api/files', () => {
  let dir: string;
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'srv-files-'));
    app = buildApp({ vaultDir: dir, syncToken: TOKEN });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('happy path: empty → put → get → list → delete', async () => {
    // Empty
    let list = await request(app).get('/api/files').set('Authorization', AUTH);
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);

    // Put
    const put = await request(app)
      .put('/api/files/foo.md')
      .set('Authorization', AUTH)
      .set('Content-Type', 'text/markdown')
      .send('# Hello');
    expect(put.status).toBe(200);
    expect(put.body.path).toBe('foo.md');
    expect(put.body.etag).toBe(computeEtag('# Hello'));
    expect(put.headers.etag).toBe(computeEtag('# Hello'));

    // Get back (binary response → blob so res.body is a Buffer)
    const get = await request(app)
      .get('/api/files/foo.md')
      .set('Authorization', AUTH)
      .responseType('blob');
    expect(get.status).toBe(200);
    expect(get.body.toString('utf8')).toBe('# Hello');
    expect(get.headers.etag).toBe(computeEtag('# Hello'));

    // List
    list = await request(app).get('/api/files').set('Authorization', AUTH);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ path: 'foo.md', etag: computeEtag('# Hello') });
    expect(typeof list.body[0].mtime).toBe('number');

    // Delete
    const del = await request(app).delete('/api/files/foo.md').set('Authorization', AUTH);
    expect(del.status).toBe(200);
    const after = await request(app).get('/api/files').set('Authorization', AUTH);
    expect(after.body).toEqual([]);
  });

  it('supports nested paths', async () => {
    await request(app)
      .put('/api/files/projects/sub/x.md')
      .set('Authorization', AUTH)
      .send('nested');
    const get = await request(app)
      .get('/api/files/projects/sub/x.md')
      .set('Authorization', AUTH)
      .responseType('blob');
    expect(get.status).toBe(200);
    expect(get.body.toString('utf8')).toBe('nested');
  });

  it('409 on stale If-Match, returns current server content', async () => {
    const put1 = await request(app)
      .put('/api/files/note.md')
      .set('Authorization', AUTH)
      .send('original');
    const etag1 = put1.body.etag;

    // Someone else writes (advances the server etag).
    await request(app)
      .put('/api/files/note.md')
      .set('Authorization', AUTH)
      .set('If-Match', etag1)
      .send('server-side update');

    // Our stale write with the old etag → conflict.
    const conflict = await request(app)
      .put('/api/files/note.md')
      .set('Authorization', AUTH)
      .set('If-Match', etag1)
      .responseType('blob')
      .send('my local change');
    expect(conflict.status).toBe(409);
    expect(conflict.body.toString('utf8')).toBe('server-side update');
    expect(conflict.headers.etag).toBe(computeEtag('server-side update'));
  });

  it('allows write of a new file without If-Match', async () => {
    const res = await request(app)
      .put('/api/files/fresh.md')
      .set('Authorization', AUTH)
      .send('brand new');
    expect(res.status).toBe(200);
  });

  it('401 without/with wrong token on /api/files', async () => {
    expect((await request(app).get('/api/files')).status).toBe(401);
    expect(
      (await request(app).get('/api/files').set('Authorization', 'Bearer nope')).status,
    ).toBe(401);
    expect(
      (await request(app).put('/api/files/x.md').set('Authorization', 'Bearer nope').send('x'))
        .status,
    ).toBe(401);
  });

  it('404 for missing file on GET and DELETE', async () => {
    expect(
      (await request(app).get('/api/files/missing.md').set('Authorization', AUTH)).status,
    ).toBe(404);
    expect(
      (await request(app).delete('/api/files/missing.md').set('Authorization', AUTH)).status,
    ).toBe(404);
  });

  it('rejects path traversal and .meta access', async () => {
    expect(
      (await request(app).get('/api/files/..%2F..%2Fetc%2Fpasswd').set('Authorization', AUTH))
        .status,
    ).toBe(400);
    expect(
      (await request(app).get('/api/files/.meta/foo.md.json').set('Authorization', AUTH))
        .status,
    ).toBe(400);
    // Files under .meta are never listed.
    await request(app).put('/api/files/real.md').set('Authorization', AUTH).send('real');
    const list = await request(app).get('/api/files').set('Authorization', AUTH);
    expect(list.body.every((e: { path: string }) => !e.path.startsWith('.meta'))).toBe(true);
  });
});

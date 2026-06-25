import { Router } from 'express';
import type { FileStore } from '../store';
import { sanitizeRelPath } from '../paths';

/**
 * File sync routes (ADR-0009):
 *   GET    /api/files            → [{ path, etag, mtime }]
 *   GET    /api/files/*          → file content (binary), ETag header
 *   PUT    /api/files/*          → upload; If-Match for conflict check → 409
 *   DELETE /api/files/*          → delete file
 */
export function filesRouter(store: FileStore): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const list = await store.list();
    res.json(list);
  });

  // `*` captures the remaining path including slashes.
  router.get('/*', async (req, res) => {
    const rel = sanitizeRelPath((req.params as Record<string, string>)[0] ?? '');
    if (rel == null) {
      res.status(400).json({ error: 'invalid path' });
      return;
    }
    const result = await store.read(rel);
    if (!result) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.setHeader('ETag', result.etag);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(result.content);
  });

  router.put('/*', async (req, res) => {
    const rel = sanitizeRelPath((req.params as Record<string, string>)[0] ?? '');
    if (rel == null) {
      res.status(400).json({ error: 'invalid path' });
      return;
    }
    const current = await store.etagFor(rel);
    const ifMatch = req.header('If-Match');
    // Conflict: file exists, caller provided a stale ETag.
    if (current != null && ifMatch != null && ifMatch !== current) {
      const server = await store.read(rel);
      res.status(409);
      if (server) res.setHeader('ETag', server.etag);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.send(server ? server.content : Buffer.alloc(0));
      return;
    }
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? '');
    const entry = await store.write(rel, body);
    res.setHeader('ETag', entry.etag);
    res.json(entry);
  });

  router.delete('/*', async (req, res) => {
    const rel = sanitizeRelPath((req.params as Record<string, string>)[0] ?? '');
    if (rel == null) {
      res.status(400).json({ error: 'invalid path' });
      return;
    }
    const existed = await store.delete(rel);
    if (!existed) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}

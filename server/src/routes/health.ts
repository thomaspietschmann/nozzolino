import { Router } from 'express';
import { getVersion } from '../version';

/** GET /api/health → { ok, version }. No auth (reverse-proxy health checks). */
export function healthRouter(): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({ ok: true, version: getVersion() });
  });
  return router;
}

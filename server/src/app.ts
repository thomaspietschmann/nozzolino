import express from 'express';
import type { Express } from 'express';
import { bearerAuth } from './auth';
import { FileStore } from './store';
import { filesRouter } from './routes/files';
import { healthRouter } from './routes/health';

export interface AppOptions {
  vaultDir: string;
  syncToken: string;
}

/**
 * Builds the Express app without listening — used directly by tests (supertest)
 * and by index.ts for the real server.
 */
export function buildApp(opts: AppOptions): Express {
  const app = express();
  // Raw body for binary-safe file uploads of any content type.
  app.use(express.raw({ type: '*/*', limit: '50mb' }));

  const store = new FileStore(opts.vaultDir);

  // Health is unauthenticated so reverse-proxy probes work.
  app.use('/api/health', healthRouter());
  // Everything under /api/files requires the bearer token.
  app.use('/api/files', bearerAuth(opts.syncToken), filesRouter(store));

  return app;
}

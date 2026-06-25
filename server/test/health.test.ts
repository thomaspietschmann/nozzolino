import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app';

describe('GET /api/health', () => {
  const app = buildApp({ vaultDir: '/tmp/does-not-matter', syncToken: 'secret' });

  it('returns ok + version without auth', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.version).toBe('string');
  });
});

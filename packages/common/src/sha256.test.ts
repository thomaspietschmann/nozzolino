import { describe, it, expect } from 'vitest';
import { sha256Hex16 } from './sha256.js';

describe('sha256Hex16', () => {
  it('returns the first 16 hex chars of the SHA-256 digest', async () => {
    // Known SHA-256("hello world") = b94d27b9934d3e08a52e52d7da7dabfac484efe3...
    expect(await sha256Hex16('hello world')).toBe('b94d27b9934d3e08');
  });

  it('is deterministic and 16 hex chars', async () => {
    const a = await sha256Hex16('some note body');
    const b = await sha256Hex16('some note body');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('differs for different content', async () => {
    expect(await sha256Hex16('a')).not.toBe(await sha256Hex16('b'));
  });
});

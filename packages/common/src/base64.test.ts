import { describe, it, expect } from 'vitest';
import { bytesToBase64, base64ToBytes } from './base64.js';
import { sha256Hex16Bytes } from './sha256.js';

function roundTrip(bytes: Uint8Array): Uint8Array {
  return base64ToBytes(bytesToBase64(bytes));
}

describe('base64 codec', () => {
  it('round-trips an empty buffer', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
    expect(base64ToBytes('')).toEqual(new Uint8Array(0));
  });

  it('round-trips the full byte range (0x00–0xff)', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    expect(Array.from(roundTrip(bytes))).toEqual(Array.from(bytes));
  });

  it('round-trips every length 0..16 (padding boundaries)', () => {
    for (let n = 0; n <= 16; n++) {
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) bytes[i] = (i * 37 + 11) & 0xff;
      expect(Array.from(roundTrip(bytes))).toEqual(Array.from(bytes));
    }
  });

  it('round-trips bytes including 0x00, 0xff and non-ASCII', () => {
    const bytes = new Uint8Array([0x00, 0xff, 0x80, 0x7f, 0xc3, 0xa9, 0x00, 0xfe]);
    expect(Array.from(roundTrip(bytes))).toEqual(Array.from(bytes));
  });

  it('produces standard base64 output', () => {
    expect(bytesToBase64(new TextEncoder().encode('Man'))).toBe('TWFu');
    expect(bytesToBase64(new TextEncoder().encode('Ma'))).toBe('TWE=');
    expect(bytesToBase64(new TextEncoder().encode('M'))).toBe('TQ==');
  });
});

describe('sha256Hex16Bytes', () => {
  it('is deterministic and 16 hex chars', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 0xff, 0x00]);
    const a = await sha256Hex16Bytes(bytes);
    const b = await sha256Hex16Bytes(new Uint8Array([1, 2, 3, 4, 0xff, 0x00]));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('differs for different bytes', async () => {
    const a = await sha256Hex16Bytes(new Uint8Array([1, 2, 3]));
    const b = await sha256Hex16Bytes(new Uint8Array([1, 2, 4]));
    expect(a).not.toBe(b);
  });
});

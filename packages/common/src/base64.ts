/**
 * Pure-JS base64 codec. Avoids Buffer (Node-only) and atob/btoa (which mangle
 * bytes >0x7f), so a single implementation works in Node, the browser, and the
 * Android WebView. Used to ferry binary attachments through the string-only
 * VaultFS / bridge boundary.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Reverse lookup table: char code → 6-bit value (255 = invalid/padding).
const LOOKUP = (() => {
  const table = new Uint8Array(256).fill(255);
  for (let i = 0; i < ALPHABET.length; i++) {
    table[ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < len ? bytes[i + 1]! : 0;
    const b2 = i + 2 < len ? bytes[i + 2]! : 0;
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < len ? ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < len ? ALPHABET[b2 & 0x3f] : '=';
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  // Strip whitespace/newlines that some encoders insert.
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  const len = clean.length;
  if (len === 0) return new Uint8Array(0);
  let pad = 0;
  if (clean[len - 1] === '=') pad++;
  if (clean[len - 2] === '=') pad++;
  const byteLen = (len >> 2) * 3 - pad;
  const out = new Uint8Array(byteLen);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const c0 = LOOKUP[clean.charCodeAt(i)]!;
    const c1 = LOOKUP[clean.charCodeAt(i + 1)]!;
    const c2 = LOOKUP[clean.charCodeAt(i + 2)]!;
    const c3 = LOOKUP[clean.charCodeAt(i + 3)]!;
    const n = (c0 << 18) | (c1 << 12) | ((c2 & 63) << 6) | (c3 & 63);
    if (p < byteLen) out[p++] = (n >> 16) & 0xff;
    if (p < byteLen) out[p++] = (n >> 8) & 0xff;
    if (p < byteLen) out[p++] = n & 0xff;
  }
  return out;
}

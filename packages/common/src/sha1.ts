/**
 * Synchronous SHA-1 digest (hex string). Not for cryptographic security —
 * used only for self-write fingerprinting in the vault watcher seam. Mirrors
 * desktop's `createHash('sha1').update(content).digest('hex')` from node:crypto.
 */
export function sha1Hex(str: string): string {
  const data = new TextEncoder().encode(str);
  const ml = data.length;
  const bitLen = ml * 8;

  // Pad: append 0x80, then zeros so total ≡ 56 (mod 64), then 8-byte bit-length.
  const padLen = ((56 - (ml + 1)) % 64 + 64) % 64;
  const buf = new Uint8Array(ml + 1 + padLen + 8);
  buf.set(data);
  buf[ml] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(buf.length - 8, Math.floor(bitLen / 2 ** 32), false);
  view.setUint32(buf.length - 4, bitLen >>> 0, false);

  // Initial hash values (SHA-1 spec).
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Uint32Array(80);

  for (let off = 0; off < buf.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 80; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const v = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!;
      w[i] = (v << 1) | (v >>> 31);
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4;

    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const tmp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]!) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = tmp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4].map((n) => n.toString(16).padStart(8, '0')).join('');
}

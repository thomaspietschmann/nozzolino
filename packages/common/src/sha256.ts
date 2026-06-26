/**
 * SHA-256 digest of UTF-8 content, first 16 hex chars. Matches the server's
 * ETag scheme (ADR-0009). Uses Web Crypto, available in Node 22 (globalThis.crypto)
 * and in the browser/WebView, so a single impl works on every platform.
 */
export async function sha256Hex16(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  return sha256Hex16Bytes(data);
}

/**
 * SHA-256 digest of raw bytes, first 16 hex chars. Mirrors {@link sha256Hex16}
 * but for binary content (attachments), so server and client agree on the ETag
 * of an image/PDF. Web Crypto works in Node 22, the browser, and the WebView.
 */
export async function sha256Hex16Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 16);
}

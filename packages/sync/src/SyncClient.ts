import type { ServerFileEntry, SyncTransport } from './syncTypes.js';

export class SyncError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * HTTP client for the bundled sync server (ADR-0009). Uses the global `fetch`
 * (Node 22 + WebView) by default; a custom impl can be injected for tests.
 */
export class SyncClient implements SyncTransport {
  private readonly base: string;
  private readonly fetchImpl: FetchLike;

  constructor(
    baseUrl: string,
    private readonly token: string,
    fetchImpl?: FetchLike,
  ) {
    this.base = baseUrl.replace(/\/+$/, '');
    this.fetchImpl =
      fetchImpl ?? ((input, init) => fetch(input, init));
  }

  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, ...extra };
  }

  private encodePath(path: string): string {
    // Encode each segment but keep the slashes between them.
    return path
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
  }

  async health(): Promise<{ ok: boolean; version: string }> {
    const res = await this.fetchImpl(`${this.base}/api/health`);
    if (!res.ok) throw new SyncError(`health failed: ${res.status}`, res.status);
    return (await res.json()) as { ok: boolean; version: string };
  }

  async listFiles(): Promise<ServerFileEntry[]> {
    const res = await this.fetchImpl(`${this.base}/api/files`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new SyncError(`listFiles failed: ${res.status}`, res.status);
    return (await res.json()) as ServerFileEntry[];
  }

  async getFile(path: string): Promise<{ content: string; etag: string }> {
    const res = await this.fetchImpl(`${this.base}/api/files/${this.encodePath(path)}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new SyncError(`getFile ${path} failed: ${res.status}`, res.status);
    const content = await res.text();
    const etag = res.headers.get('ETag') ?? '';
    return { content, etag };
  }

  async putFile(
    path: string,
    content: string,
    ifMatch?: string,
  ): Promise<
    | { ok: true; etag: string }
    | { ok: false; conflict: true; serverContent: string; etag: string }
  > {
    const headers = this.authHeaders({ 'Content-Type': 'application/octet-stream' });
    if (ifMatch) headers['If-Match'] = ifMatch;
    const res = await this.fetchImpl(`${this.base}/api/files/${this.encodePath(path)}`, {
      method: 'PUT',
      headers,
      body: content,
    });
    if (res.status === 409) {
      const serverContent = await res.text();
      return {
        ok: false,
        conflict: true,
        serverContent,
        etag: res.headers.get('ETag') ?? '',
      };
    }
    if (!res.ok) throw new SyncError(`putFile ${path} failed: ${res.status}`, res.status);
    const body = (await res.json()) as { etag: string };
    return { ok: true, etag: body.etag };
  }

  async getBinary(path: string): Promise<{ bytes: Uint8Array; etag: string }> {
    const res = await this.fetchImpl(`${this.base}/api/files/${this.encodePath(path)}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new SyncError(`getBinary ${path} failed: ${res.status}`, res.status);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const etag = res.headers.get('ETag') ?? '';
    return { bytes, etag };
  }

  async putBinary(
    path: string,
    bytes: Uint8Array,
    ifMatch?: string,
  ): Promise<{ ok: true; etag: string } | { ok: false; conflict: true; etag: string }> {
    const headers = this.authHeaders({ 'Content-Type': 'application/octet-stream' });
    if (ifMatch) headers['If-Match'] = ifMatch;
    const res = await this.fetchImpl(`${this.base}/api/files/${this.encodePath(path)}`, {
      method: 'PUT',
      headers,
      body: bytes,
    });
    if (res.status === 409) {
      return { ok: false, conflict: true, etag: res.headers.get('ETag') ?? '' };
    }
    if (!res.ok) throw new SyncError(`putBinary ${path} failed: ${res.status}`, res.status);
    const body = (await res.json()) as { etag: string };
    return { ok: true, etag: body.etag };
  }

  async deleteFile(path: string, ifMatch?: string): Promise<void> {
    const headers = this.authHeaders();
    if (ifMatch) headers['If-Match'] = ifMatch;
    const res = await this.fetchImpl(`${this.base}/api/files/${this.encodePath(path)}`, {
      method: 'DELETE',
      headers,
    });
    // 404 is acceptable for an idempotent delete.
    if (!res.ok && res.status !== 404) {
      throw new SyncError(`deleteFile ${path} failed: ${res.status}`, res.status);
    }
  }
}

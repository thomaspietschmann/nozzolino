import type { SyncStatus } from '@notes-app/common';

/** One file as reported by the server's GET /api/files. */
export interface ServerFileEntry {
  path: string;
  etag: string;
  mtime: number;
}

/** Minimal local file listing entry used by the engine's walk. */
export interface LocalFileEntry {
  path: string;
  mtime: number;
}

/**
 * Structural subset of VaultFS the SyncEngine needs. Declared here (not imported
 * from @notes-app/vault) to avoid a vault→sync→vault dependency cycle; the
 * concrete NodeVaultFS / CapacitorVaultFS / MemoryVaultFS all satisfy it.
 */
export interface SyncFS {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  listDirectory(path: string): Promise<{ path: string; isDirectory: boolean }[]>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<{ mtime: Date }>;
  /** Read a binary attachment, returning its bytes as base64. */
  readBinaryFile(path: string): Promise<string>;
  /** Write a binary attachment from base64 bytes. */
  writeBinaryFile(path: string, base64: string): Promise<void>;
}

/** Persisted map of last-acknowledged server ETags, keyed by vault-relative path. */
export interface EtagCache {
  load(): Promise<void>;
  get(path: string): string | undefined;
  set(path: string, etag: string): void;
  delete(path: string): void;
  persist(): Promise<void>;
}

/** Result of a single sync pass. */
export interface SyncResult {
  pushed: string[];
  pulled: string[];
  conflicted: string[];
  deletedLocal: string[];
  deletedRemote: string[];
  status: SyncStatus;
}

export interface SyncDeps {
  client: SyncTransport;
  fs: SyncFS;
  cache: EtagCache;
  /** Compute the server-compatible ETag (sha256, first 16 hex) of UTF-8 content. */
  hash: (content: string) => string | Promise<string>;
  /**
   * Both-sides-changed conflict. Implementations snapshot the current local file
   * into a conflict copy (M5 flow) and then write `serverContent` to the primary path.
   */
  onConflict: (path: string, serverContent: string) => Promise<void>;
  /** Surface the running sync status to the UI (the 4-state dot). */
  onStatus: (status: SyncStatus) => void;
  /** Called after the engine writes a pulled file locally (index refresh + self-write attribution). */
  onLocalWrite?: (path: string, content: string) => void | Promise<void>;
  /** Called after the engine deletes a file locally. */
  onLocalDelete?: (path: string) => void | Promise<void>;
  /** Filter for which vault paths participate in sync. Default: *.md, excluding conflict copies. */
  shouldSync?: (path: string) => boolean;
}

/** HTTP transport surface implemented by SyncClient (mockable in tests). */
export interface SyncTransport {
  listFiles(): Promise<ServerFileEntry[]>;
  getFile(path: string): Promise<{ content: string; etag: string }>;
  putFile(
    path: string,
    content: string,
    ifMatch?: string,
  ): Promise<
    | { ok: true; etag: string }
    | { ok: false; conflict: true; serverContent: string; etag: string }
  >;
  deleteFile(path: string, ifMatch?: string): Promise<void>;
  health(): Promise<{ ok: boolean; version: string }>;
  /** Fetch a binary attachment's raw bytes + ETag. */
  getBinary(path: string): Promise<{ bytes: Uint8Array; etag: string }>;
  /**
   * Upload a binary attachment's raw bytes. On a 409 the server's content is not
   * returned (binary merge is meaningless — the engine resolves last-write-wins).
   */
  putBinary(
    path: string,
    bytes: Uint8Array,
    ifMatch?: string,
  ): Promise<{ ok: true; etag: string } | { ok: false; conflict: true; etag: string }>;
}

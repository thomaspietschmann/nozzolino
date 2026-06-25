/**
 * Core domain types shared across all packages.
 * Derived from ADR-0004 (file format) and technical-guidelines §4.
 */

/** YAML frontmatter fields present in every .md note file. */
export interface Frontmatter {
  /** Stable UUIDv4, assigned lazily on first app save (ADR-0006). */
  id?: string;
  /** Flat tag list. Always an array, never a comma-string (ADR-0004). */
  tags: string[];
  /** Optional emoji shown as the node label in the graph view. */
  emoji?: string;
  /** ISO 8601 UTC. Set on first save; never updated afterwards. */
  created?: string;
  /** ISO 8601 UTC. Updated by the app on every save. */
  modified?: string;
  /** Allow arbitrary extra fields from externally edited files. */
  [key: string]: unknown;
}

/** A single directed relationship parsed from [[Title||TYPE]] syntax. */
export interface Outlink {
  /** The filename stem (title) of the target note. */
  targetTitle: string;
  /** The relationship type, or null for plain [[Title]] links. */
  relationshipType: string | null;
}

/**
 * In-memory representation of a note. Built from disk at startup;
 * never persisted. Source of truth is always the .md file.
 */
export interface NoteRecord {
  /**
   * Stable UUIDv4. May be in-memory only until the note is saved
   * through the app for the first time (ADR-0006).
   */
  id: string;
  /** Vault-relative path (POSIX, may include subdirectory segments, e.g. "projects/foo.md"). */
  path: string;
  /** Note title (filename stem without .md extension). */
  title: string;
  /** Emoji from frontmatter, or null if not set. */
  emoji: string | null;
  /** Tags from frontmatter. */
  tags: string[];
  /** Parsed outgoing wiki-links. */
  outlinks: Outlink[];
  /** Creation date from frontmatter (set on first app save). */
  created?: Date;
  /** Last-modified date from frontmatter or file system mtime. */
  modified: Date;
  /** Full plain text of the body, Markdown syntax stripped, for search indexing. */
  bodyText: string;
}

/** Four possible sync states shown by the status dot. */
export type SyncStatus = 'synced' | 'syncing' | 'error' | 'offline';

/** A detected conflict between two versions of the same note. */
export interface ConflictRecord {
  /** ID of the note that has a conflict. */
  noteId: string;
  /** Absolute path to the primary note file. */
  notePath: string;
  /** Absolute path to the conflict copy (e.g. note.sync-conflict-…md). */
  conflictFilePath: string;
  /** When the conflict was first detected. */
  detectedAt: Date;
}

/** Persistent vault settings stored in app user data (not in the vault). */
export interface VaultConfig {
  /** Absolute path to the vault root directory. */
  vaultPath: string;
  /** Which sync mechanism is active. */
  syncMode: 'syncthing' | 'server' | 'none';
  /** URL of the bundled sync server (server mode only). */
  serverUrl?: string;
  /** Bearer token for the sync server (server mode only). */
  syncToken?: string;
}

/** Sync configuration subset persisted in app user data and edited in settings (M7). */
export interface SyncSettings {
  /** Which sync mechanism is active. */
  syncMode: 'syncthing' | 'server' | 'none';
  /** URL of the bundled sync server (server mode only). */
  serverUrl?: string;
  /** Bearer token for the sync server (server mode only). */
  syncToken?: string;
}

/** A single result returned by the search package. */
export interface SearchResult {
  noteId: string;
  title: string;
  /** ~150-character excerpt of body text around the first match. */
  snippet: string;
  /** Lunr relevance score. */
  score: number;
}

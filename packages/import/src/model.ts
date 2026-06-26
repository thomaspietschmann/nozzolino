/**
 * Domain types for the Anytype import pipeline.
 */

/** One Anytype object parsed from a single .md export file. */
export interface AnytypeObject {
  /** Vault-relative path of the source .md file within the import bundle. */
  sourcePath: string;
  /** Anytype object id from frontmatter (used to resolve CID-style links). */
  id?: string;
  /** Resolved title: first H1 or filename stem. */
  title: string;
  /** Raw markdown body (frontmatter already stripped). */
  body: string;
  /**
   * All non-reserved frontmatter fields normalised to string arrays.
   * Reserved keys (id, created, modified, emoji) are excluded here.
   */
  relations: Record<string, string[]>;
  /** Markdown links whose target resolved to another .md file in the bundle. */
  links: Array<{ targetRef: string; label?: string; relation?: string }>;
  /** Markdown links / images pointing to binary assets (under files/ or non-.md). */
  attachments: Array<{ ref: string }>;
  createdAt?: string;
  modifiedAt?: string;
  emoji?: string;
}

/** A binary attachment ready to be copied into the vault. */
export interface PreparedAttachment {
  /** Vault-relative POSIX path (e.g. "files/report.pdf"). */
  vaultPath: string;
  /** Base64-encoded file contents. */
  base64: string;
}

/** A note ready to be written to the vault. */
export interface PreparedNote {
  /** Vault-relative path (e.g. "My Note.md"). */
  relativePath: string;
  /** Full serialized note content including frontmatter block. */
  content: string;
}

/** High-level counts returned by prepareImport / writeImport. */
export interface ImportSummary {
  /** Total notes imported. */
  noteCount: number;
  /**
   * Total tag assignments across all notes (sum, not distinct).
   * i.e. if two notes each have 2 tags, tagCount = 4.
   */
  tagCount: number;
  /** Number of wikilinks successfully resolved and written. */
  linkCount: number;
  /** Number of markdown links that could not be resolved to an imported note. */
  unresolvedLinks: number;
  /** Number of attachment references collected (not written in v1). */
  attachmentCount: number;
}

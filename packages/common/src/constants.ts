/**
 * Shared constants used across all packages.
 * Changing a value here propagates everywhere automatically.
 */

// ─── Frontmatter field names ─────────────────────────────────────────────────

export const FRONTMATTER_FIELDS = {
  ID: 'id',
  TAGS: 'tags',
  EMOJI: 'emoji',
  CREATED: 'created',
  MODIFIED: 'modified',
} as const;

// ─── Syntax highlight languages (requirements.md line 59) ────────────────────
// Exactly 7 — "8" in action-items.md was a counting error (see source-reconciliation.md).

export const SYNTAX_HIGHLIGHT_LANGUAGES = [
  'bash',
  'java',
  'rust',
  'ruby',
  'javascript',
  'typescript',
  'kotlin',
] as const;

export type SyntaxHighlightLanguage = (typeof SYNTAX_HIGHLIGHT_LANGUAGES)[number];

// ─── Accent colour presets (technical-guidelines §12) ────────────────────────
// Exactly 6 presets. No free hex picker.

export const ACCENT_PRESETS = [
  { name: 'Indigo', key: 'indigo', value: '#6366f1' },
  { name: 'Teal', key: 'teal', value: '#14b8a6' },
  { name: 'Rose', key: 'rose', value: '#f43f5e' },
  { name: 'Amber', key: 'amber', value: '#f59e0b' },
  { name: 'Violet', key: 'violet', value: '#8b5cf6' },
  { name: 'Slate', key: 'slate', value: '#64748b' },
] as const;

export type AccentPresetKey = (typeof ACCENT_PRESETS)[number]['key'];

// ─── IPC channel names (Electron contextBridge) ──────────────────────────────
// Single source of truth — both main process and renderer import from here.

export const IPC = {
  // Vault
  VAULT_OPEN: 'vault:open',
  VAULT_GET_CONFIG: 'vault:getConfig',
  VAULT_GET_NOTES: 'vault:getNotes',
  VAULT_GET_RECENT: 'vault:getRecent',
  VAULT_ADD_RECENT: 'vault:addRecent',
  VAULT_GET_BACKLINKS: 'vault:getBacklinks',
  VAULT_GET_RELATIONSHIP_TYPES: 'vault:getRelationshipTypes',
  // File operations
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_CREATE: 'file:create',
  FILE_RENAME: 'file:rename',
  FILE_DELETE: 'file:delete',
  FILE_LIST: 'file:list',
  FILE_UPDATE_FRONTMATTER: 'file:updateFrontmatter',
  // Folder operations
  FOLDER_CREATE: 'folder:create',
  FOLDER_RENAME: 'folder:rename',
  FOLDER_DELETE: 'folder:delete',
  // Dialogs
  DIALOG_OPEN_FOLDER: 'dialog:openFolder',
  // Image
  IMAGE_SAVE: 'image:save',
  // Watcher events (main → renderer)
  VAULT_FILE_CHANGED: 'vault:fileChanged',
  VAULT_FILE_DELETED: 'vault:fileDeleted',
  VAULT_DIR_CHANGED: 'vault:dirChanged',
  // Sync
  SYNC_FORCE_SYNC: 'sync:forceSync',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

// ─── Misc ─────────────────────────────────────────────────────────────────────

/** Syncthing conflict file infix pattern. Used to detect conflict copies. */
export const SYNCTHING_CONFLICT_INFIX = '.sync-conflict-';

/** Auto-save debounce in milliseconds (M1 editor). */
export const AUTOSAVE_DEBOUNCE_MS = 1000;

/** Search debounce in milliseconds (M3 search UI). */
export const SEARCH_DEBOUNCE_MS = 300;

/** Snippet length in characters for search results. */
export const SEARCH_SNIPPET_LENGTH = 150;

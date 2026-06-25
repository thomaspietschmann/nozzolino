export type {
  Frontmatter,
  Outlink,
  NoteRecord,
  SyncStatus,
  ConflictRecord,
  VaultConfig,
  SyncSettings,
  SearchResult,
} from './types.js';

export {
  FRONTMATTER_FIELDS,
  SYNTAX_HIGHLIGHT_LANGUAGES,
  ACCENT_PRESETS,
  IPC,
  SYNCTHING_CONFLICT_INFIX,
  AUTOSAVE_DEBOUNCE_MS,
  SEARCH_DEBOUNCE_MS,
  SEARCH_SNIPPET_LENGTH,
} from './constants.js';

export type { SyntaxHighlightLanguage, AccentPresetKey, IpcChannel } from './constants.js';

export { parseFrontmatter, serializeFrontmatter } from './frontmatter.js';

export { WIKILINK_REGEX, parseWikiLinks, replaceWikiLinkTarget } from './wikilinks.js';

export { posixJoin, posixDirname, posixBasename } from './posixPath.js';

export { sha1Hex } from './sha1.js';

export { sha256Hex16 } from './sha256.js';

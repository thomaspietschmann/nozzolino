# Action Items — Personal Notes App Build Plan

---

## Phase 0: Monorepo Foundation

Dependencies: none. All subsequent phases depend on this phase being complete.

1. Initialise git repository with `.gitignore` covering `node_modules`, `dist`, `out`, `.gradle`, `*.apk`, `*.aab`, Electron build artefacts, and Capacitor Android build output.
2. Create `pnpm-workspace.yaml` declaring packages: `packages/app`, `packages/desktop`, `packages/mobile`, `packages/server`, `packages/shared`.
3. Scaffold root `package.json` with `"private": true`, pnpm engine constraint, and workspace-level dev scripts (`dev`, `build`, `lint`, `test`, `typecheck`).
4. Add root `tsconfig.base.json` with strict mode, path aliases pointing to each workspace package, and `moduleResolution: bundler`.
5. Configure ESLint (flat config) at root: TypeScript rules, React rules, import-order, no floating promises; add `.eslintrc` ignores for generated files.
6. Configure Prettier at root with a single `.prettierrc`; add format script to root `package.json`.
7. Create `packages/shared`: scaffold `src/`, `package.json`, `tsconfig.json` extending base; this package will hold types, utilities, and constants shared across all other packages.
8. Define core shared TypeScript types in `packages/shared/src/types.ts`: `Note`, `Frontmatter`, `Relationship`, `RelationshipType`, `SyncStatus`, `ConflictFile`, `VaultConfig`.
9. Define shared constants in `packages/shared/src/constants.ts`: frontmatter field names, relationship syntax regex, supported syntax-highlight languages, accent colour token names.
10. Write shared utility: `parseFrontmatter(content: string): Frontmatter` using `gray-matter`; unit test round-trip parse/serialize.
11. Write shared utility: `serializeFrontmatter(frontmatter: Frontmatter, body: string): string`; unit test against known fixtures.
12. Write shared utility: `parseWikiLinks(content: string): Relationship[]` with regex for `[[Title||TYPE]]` and `[[Title]]`; unit test edge cases (pipes in title, missing type, nested brackets).
13. Write shared utility: `replaceWikiLinkTarget(content: string, oldTitle: string, newTitle: string): string`; unit test rename propagation.
14. Add Vitest at root level as the single test runner; configure `vitest.workspace.ts` pointing at each package.
15. Set up GitHub Actions workflow `ci.yml`: install pnpm, run typecheck, lint, and test on push and pull request to `main`.

---

## Phase 1: Desktop Shell

Dependencies: Phase 0 complete.

1. Scaffold `packages/desktop` as an Electron + Vite project: add `electron`, `electron-builder`, `vite-plugin-electron`, `vite-plugin-electron-renderer` as dev deps; create `electron/main.ts` and `electron/preload.ts`.
2. Configure Vite in `packages/desktop/vite.config.ts`: React plugin, path aliases, split renderer and main entry points.
3. Implement the Electron main process skeleton: create `BrowserWindow` with sensible defaults (no frame optional, webPreferences secure), load renderer URL in dev, load built `index.html` in prod.
4. Implement the preload script: expose a typed `window.electronAPI` bridge using `contextBridge` covering IPC channels needed by the vault, file, and sync subsystems (define channel name constants in `shared`).
5. Add `packages/app`: scaffold `package.json`, `tsconfig.json`, `src/`, `index.html`; install React 18, ReactDOM, TypeScript, Vite React plugin, Tailwind CSS, Zustand, and shared package as workspace dep.
6. Configure Tailwind CSS: `tailwind.config.ts` with content paths covering both `packages/app/src` and `packages/desktop`; define CSS custom properties for the 6 accent colour presets and dark/light surface tokens.
7. Create root `App.tsx` with React Router (hash router for Electron compatibility): routes for `/`, `/note/:id`, `/graph`, `/search`, `/settings`, `/onboarding`.
8. Implement global Zustand store structure (`packages/app/src/store/`): separate slice files for `vault`, `notes`, `ui`, `sync`, `search`; wire slices together with `combine` or individual `create` calls.
9. Implement the Electron IPC handler layer in `electron/main.ts`: register handlers for `vault:open`, `vault:getConfig`, `file:read`, `file:write`, `file:rename`, `file:delete`, `file:list`, `dialog:openFolder`.
10. Implement `vaultSlice`: actions `openVault(path)`, `closeVault()`, `setVaultConfig(config)`; persist last vault path in Electron `app.getPath('userData')` via `electron-store`.
11. Build the vault-open screen: button to open folder via `dialog:openFolder` IPC, display recent vaults list from persisted config, wire to `vaultSlice`.
12. Implement `electron-builder` config in `packages/desktop/electron-builder.yml`: Linux targets (AppImage, deb), app id, icon, file associations for `.md`.
13. Add `dev` script that runs Vite dev server and Electron together via `concurrently`; verify hot-reload works end-to-end.

---

## Phase 2: Vault & File System

Dependencies: Phase 1 complete.

1. Implement `VaultScanner`: a Node.js class (main process) that recursively walks a directory, collects all `.md` file paths and their `mtime`/`size`, and returns a `FileRecord[]`.
2. Implement `NoteParser`: reads a file, calls `parseFrontmatter`, extracts `uuid` (generating one if absent), `created` (from mtime if absent), `modified`, `emoji`, `tags`, and body; writes back if frontmatter was mutated.
3. Implement the index build pipeline: on vault open, call `VaultScanner` then `NoteParser` for each file, accumulate `Note[]` into `notesSlice`, measure elapsed time.
4. Implement onboarding flow: if vault directory is empty, render empty-state hint card with vault structure explanation; if vault is non-empty, show confirmation dialog ("Index X files?") before scanning.
5. Wire `chokidar` watcher in main process: on `add`/`change` send `vault:fileChanged` IPC to renderer with file path; on `unlink` send `vault:fileDeleted`; on `addDir`/`unlinkDir` send `vault:dirChanged`.
6. Handle `vault:fileChanged` in renderer: re-parse the affected note, diff frontmatter changes, update `notesSlice` immutably without full re-index.
7. Implement `file:write` IPC handler: write via temp file then atomic rename (`fs.rename`) to prevent partial writes; emit `vault:fileChanged` after successful write.
8. Implement `file:rename` IPC handler: rename file on disk, then call `replaceWikiLinkTarget` across all vault files referencing the old title, write each affected file atomically.
9. Implement folder CRUD via IPC: `folder:create`, `folder:rename`, `folder:delete` (recursive, with confirmation flag); update `notesSlice` for all affected notes.
10. Implement note CRUD actions in `notesSlice`: `createNote(folder, title)` generates uuid and writes initial frontmatter; `deleteNote(id)` deletes file; both trigger chokidar events for consistency.
11. Implement sidebar file tree component: recursive `FolderNode` + `FileNode` components, expand/collapse state in local React state, drag-and-drop for moving notes between folders using `@dnd-kit/core`.
12. Add context menu on file tree nodes (right-click): New Note, New Folder, Rename, Delete; wire each to the appropriate slice action or IPC call.
13. Add keyboard navigation to sidebar: arrow keys move focus, Enter opens note, F2 triggers inline rename, Delete triggers delete with confirmation.

---

## Phase 3: Editor

Dependencies: Phase 2 complete.

1. Install ProseMirror packages: `prosemirror-state`, `prosemirror-view`, `prosemirror-model`, `prosemirror-schema-basic`, `prosemirror-schema-list`, `prosemirror-commands`, `prosemirror-keymap`, `prosemirror-history`, `prosemirror-inputrules`, `prosemirror-markdown`.
2. Define the custom ProseMirror schema in `packages/app/src/editor/schema.ts`: nodes for `doc`, `paragraph`, `heading` (levels 1–6), `blockquote`, `code_block` (with `language` attr), `horizontal_rule`, `image` (with `src`, `alt`, `title`), `hard_break`, `ordered_list`, `bullet_list`, `list_item`, `wiki_link` (inline node with `target` and `rel_type` attrs); marks for `em`, `strong`, `code`, `link`, `strikethrough`.
3. Implement `markdownToDoc(markdown: string, schema: Schema): Node` using `prosemirror-markdown`'s `defaultMarkdownParser` extended with custom wiki-link tokenization.
4. Implement `docToMarkdown(doc: Node): string` using `prosemirror-markdown`'s `MarkdownSerializer` extended to serialize wiki-link nodes back to `[[Title||TYPE]]` syntax.
5. Build the ProseMirror `EditorView` wrapper React component (`NoteEditor`): mount view on ref attach, expose `onChange(markdown: string)` callback, destroy on unmount.
6. Implement WYSIWYG (Typora-style) source-reveal behaviour: when cursor enters a formatted region (bold, heading, link, wiki-link) the markdown syntax tokens appear around the cursor; when cursor leaves, tokens collapse back to rendered form. Implement as a ProseMirror plugin using decorations.
7. Implement input rules for Markdown shortcuts: `**text**` → strong, `*text*` → em, `` `code` `` → code mark, `### ` → heading, `- ` → bullet list, `1. ` → ordered list, `> ` → blockquote, `---` → horizontal rule.
8. Implement syntax highlighting for `code_block` nodes: integrate `highlight.js` with the 8 required languages (bash, java, rust, ruby, javascript, typescript, kotlin, and auto-detect fallback); apply via ProseMirror decorations, not DOM mutation.
9. Implement the visual table editor: define `table`, `table_row`, `table_cell`, `table_header` nodes in schema; add `prosemirror-tables` plugin; support Tab/Shift-Tab navigation between cells; add toolbar actions for add/remove row/column.
10. Implement image paste: intercept `paste` events in the EditorView, detect `image/*` clipboard items, write blob to `<vault>/.assets/` via `file:write` IPC, insert `image` node with relative path.
11. Implement the `[[` autocomplete: a ProseMirror plugin that detects `[[` input, opens a floating `Suggestions` component populated from `notesSlice`, inserts a `wiki_link` node on selection; keyboard-navigable.
12. Implement relationship type autocomplete: after the `||` separator inside a wiki-link context, show suggestions from the existing `RelationshipType` list in the store; allow free-text entry to create a new type on confirmation.
13. Implement validation on editor blur: scan `wiki_link` nodes, cross-reference against `notesSlice`; for unknown targets, show inline decoration with "Note not found — create?" affordance.
14. Implement the quick-peek overlay: on hover over a `wiki_link` node (desktop) or long-press (mobile), open a floating panel rendering the target note body as read-only ProseMirror view; close on Escape or outside click.
15. Implement auto-save: debounce `onChange` by 1 second, call `file:write` IPC; show a saving indicator in the note header; block app close if unsaved changes exist (Electron `will-quit` handler prompts).
16. Implement frontmatter sidebar panel: display `tags`, `emoji`, `uuid`, `created`, `modified` fields as editable form controls; writes back to frontmatter via `serializeFrontmatter` without touching editor body.
17. Add tag input widget in the frontmatter panel: typeahead from vault-wide tag list (derived from all notes in `notesSlice`), supports adding and removing tags, stores as YAML array.
18. Implement note title rename: clicking the filename in the note header makes it editable; on commit calls `file:rename` IPC; update is reflected in sidebar immediately.

---

## Phase 4: Search

Dependencies: Phase 2 complete (note index must exist).

1. Install `lunr` and its TypeScript types; create `packages/app/src/search/indexer.ts` that builds a Lunr index from `notesSlice` notes, indexing only body text (strip frontmatter before indexing).
2. Implement incremental index update: expose `addToIndex(note)`, `updateInIndex(note)`, `removeFromIndex(id)` functions; call these from `notesSlice` change handlers rather than rebuilding the full index on every file change.
3. Implement `search(query: string): SearchResult[]` in `indexer.ts`: use Lunr wildcard suffix match for exact substring emulation; return hits with `id`, `title`, `snippet` (150-char extract around first match), `score`.
4. Build the search UI component: floating command-palette style panel triggered by `Ctrl+K`; text input with 300ms debounce before calling `search`; result list with title, parent folder, and snippet; keyboard navigation (↑↓ Enter).
5. Implement tag filter in the search panel: multi-select tag chips derived from vault-wide tag list; AND-filter applied client-side against `notesSlice` after Lunr results (or independently when no query text).
6. Highlight the matched substring within each result snippet using a `<mark>` element; ensure highlight is case-insensitive.
7. Wire search result click: close panel, navigate to `/note/:id`, scroll editor to the first occurrence of the query string.

---

## Phase 5: Graph View

Dependencies: Phase 2 complete (relationships parsed from wiki-links).

1. Install `cytoscape`, `cytoscape-fcose`, and their TypeScript type packages.
2. Build `graphDataSelector`: a Zustand selector that projects `notesSlice` notes + relationships into Cytoscape `ElementDefinition[]` (nodes with `id`, `label` = emoji or first char of title, `title`; edges with `source`, `target`, `relType`).
3. Create `GraphView` component: mount Cytoscape instance on a `div` ref, apply fcose layout with force-directed defaults, destroy on unmount.
4. Implement depth-1 default view: on load, show only the currently open note and its direct neighbours (one hop); derive the subgraph from the full dataset client-side.
5. Implement node expansion: clicking a node that is a neighbour loads its neighbours into the displayed subgraph (add elements, re-run layout incrementally).
6. Implement "full graph" toggle button that replaces the subgraph with all nodes/edges and re-runs layout.
7. Implement pan and zoom: enable Cytoscape's built-in pan/zoom; add on-screen zoom controls (+/- buttons and a reset button).
8. Implement node click navigation: clicking a node navigates to `/note/:id` and updates the graph focus to that node as the new ego node for depth-1 view.
9. Implement relationship-type filter: a multi-select dropdown above the graph populated with all distinct `relType` values; hiding an edge type removes those edges from the displayed set without re-running layout from scratch.
10. Style nodes: emoji label centred in a circle, font-size responsive to zoom level using a Cytoscape style function; use accent colour for the focal node, muted colour for neighbours.
11. Style edges: directional arrows, label with `relType` string, label visible only above a zoom threshold.
12. Ensure both outgoing and incoming relationships are included in the depth-1 neighbourhood query.

---

## Phase 6: Sync — Syncthing Mode

Dependencies: Phase 2 complete (atomic writes already in place).

1. Implement conflict file detection: on chokidar `add` events, detect filenames matching Syncthing conflict patterns (`.sync-conflict-` infix); add detected conflicts to a `conflictsSlice` in Zustand.
2. Build the sync status dot component: a four-state indicator (green = idle, yellow = syncing, solid red = conflict, hollow red = error); place in the app title bar; derive state from `conflictsSlice` and a `syncStatusSlice`.
3. Implement the non-blocking conflict banner: appears at the bottom of the editor when the current note has a conflict counterpart; shows "Conflict detected" with a "Resolve" CTA; does not interrupt editing.
4. Build the conflict resolution UI: side-by-side diff view (use `diff` npm package for line-level diff); left pane = current file, right pane = conflict file; read-only except for a "Use this version" button on each pane.
5. Implement manual merge: below the side-by-side diff, provide a writable ProseMirror editor pre-populated with the current version; user edits to produce the merged result.
6. Implement "Mark resolved": saves the merged content to the primary file path, deletes the conflict file, removes the conflict from `conflictsSlice`, updates sync dot to green.
7. Add a conflicts list panel (accessible from sync dot click when in conflict state): lists all unresolved conflicts across the vault with note title and conflict file timestamp.

---

## Phase 7: Sync — Server Mode

Dependencies: Phase 0 complete. Can be built in parallel with Phases 3–6.

1. Scaffold `packages/server`: `package.json`, `tsconfig.json` extending base, `src/index.ts`, `src/routes/`, `src/middleware/`, `src/storage/`.
2. Implement storage layer (`src/storage/fileStore.ts`): reads/writes `.md` files from a configurable `VAULT_PATH` env var; exposes `list()`, `read(path)`, `write(path, content)`, `delete(path)`, `stat(path)`.
3. Implement `listNotes` route: `GET /notes` returns `[{path, etag, mtime}]`; ETag is SHA-256 of file content (hex, first 16 chars).
4. Implement `getNote` route: `GET /notes/:encodedPath` returns file content with `ETag` and `Last-Modified` headers; 404 if not found.
5. Implement `putNote` route: `PUT /notes/:encodedPath` with `If-Match` header required; if ETag matches (or `*`), write atomically and return new ETag; if ETag mismatch return `412 Precondition Failed` with the server's current content in the body for client-side conflict resolution.
6. Implement `deleteNote` route: `DELETE /notes/:encodedPath` with `If-Match`; returns `204` on success, `412` on ETag mismatch.
7. Implement token authentication middleware: read `AUTH_TOKEN` from env; require `Authorization: Bearer <token>` on all routes; return `401` if missing or invalid.
8. Implement request logging middleware using `morgan`; implement error-handling middleware returning structured JSON errors.
9. Add health check route: `GET /health` returns `{status:"ok", vault: VAULT_PATH, noteCount}`.
10. Write integration tests for all routes using `supertest`: test happy paths, ETag conflict (412), missing auth (401), missing note (404).
11. Write `Dockerfile`: multi-stage build (builder installs deps + compiles TS, runner copies `dist/` and `node_modules`); expose port 3000; set `VAULT_PATH`, `AUTH_TOKEN`, `PORT` as ENV declarations.
12. Write `docker-compose.yml` in repo root for local development: mounts a local folder as `VAULT_PATH`, sets a dev token.
13. Add GitHub Actions workflow `server-publish.yml`: on tag push matching `v*`, build OCI image, push to GitHub Container Registry (`ghcr.io`).
14. Document the single `docker run` invocation in `packages/server/README.md`.

---

## Phase 8: Desktop Sync Client

Dependencies: Phase 6 (conflict resolution UI) and Phase 7 (server) complete.

1. Add `syncSlice` fields for server mode: `serverUrl`, `authToken`, `syncMode: 'syncthing' | 'server' | 'none'`; persist to vault config.
2. Implement settings screen section for sync: radio to choose mode, text fields for server URL and token (masked), test-connection button.
3. Implement `SyncEngine` class (main process): on interval (configurable, default 60s), fetch `/notes` from server, diff against local `mtime`/ETag index, determine which files to push and which to pull.
4. Implement pull: for each server-newer file, `GET /notes/:path` and write to disk atomically; update local ETag cache.
5. Implement push: for each locally-newer file, `PUT /notes/:path` with stored ETag; handle 412 by storing the conflict: write server version as `<name>.sync-conflict-<timestamp>.md` and trigger conflict detection flow.
6. Implement initial sync on vault open: run a full diff before starting the interval loop; show progress in the sync dot (yellow/spinning state).
7. Expose `sync:forceSync` IPC channel so the renderer can trigger an immediate sync cycle (used by mobile pull-down gesture too).
8. Persist the ETag cache to a JSON file in `app.getPath('userData')` so it survives restarts.

---

## Phase 9: Mobile — Capacitor Shell

Dependencies: Phase 1 (app package) complete. Phases 3–5 must be substantially complete before mobile polish.

1. Install Capacitor core and CLI in `packages/mobile`; run `cap init` with app id `com.notesthingy.app`; add `@capacitor/android` plugin.
2. Configure `capacitor.config.ts`: `webDir` pointing to `packages/app/dist`, server URL for dev livereload.
3. Add `packages/mobile/android/` via `cap add android`; commit the Gradle wrapper and project structure; add `android/` to `.gitignore` exclusions for build output only (keep source tracked).
4. Create Kotlin plugin `VaultPlugin`: register with Capacitor, expose `readFile`, `writeFile`, `listFiles`, `renameFile`, `deleteFile`, `statFile` methods operating on the Android-accessible vault directory.
5. Create Kotlin plugin `SyncPlugin`: expose `forcSync` method that posts to the Android sync foreground service; expose `getSyncStatus` returning the four-state enum.
6. Create Kotlin `SyncForegroundService`: persists across app background; runs the mtime-poll loop (configurable interval); calls `SyncEngine` logic ported/shared as a Kotlin implementation of the same HTTP sync protocol.
7. Implement mtime polling watcher in the web layer (`packages/app/src/platform/`): abstract `FileWatcher` interface with desktop (chokidar) and mobile (Capacitor plugin polling) implementations; swap via a platform detection utility.
8. Implement the Web Worker-based incremental index build: on cold start, spawn a worker that parses notes in batches of 50, `postMessage`s progress, terminates when done; main thread renders before index is complete, showing a progress indicator.
9. Implement pull-to-refresh gesture: on the note list / sidebar, a pull-down gesture triggers `sync:forceSync` via the `SyncPlugin`.
10. Implement edge-swipe sidebar: use pointer events to detect a swipe from the left edge (within 20px); animate the sidebar panel in using a CSS transform; block the swipe if an input is focused.
11. Implement long-press quick-peek: 500ms touch hold on a note list item or wiki-link triggers the quick-peek overlay; a tap outside or upward swipe dismisses it.
12. Implement pinch-to-zoom on the graph view: wire Cytoscape's touch zoom to the standard Capacitor viewport; ensure `user-scalable=no` is set in the meta viewport to prevent the OS zoom interfering.
13. Configure `AndroidManifest.xml`: internet permission (for server sync), foreground service permission, file provider for vault access, `android:largeHeap="true"`.
14. Configure Gradle signing config using environment variables for CI keystore; add `packages/mobile/android/` build to the GitHub Actions `ci.yml` workflow.
15. Add GitHub Actions workflow `android-build.yml`: on tag, build release APK/AAB, upload as workflow artefact.

---

## Phase 10: Visual Design & Theming

Dependencies: Phase 1 (Tailwind configured) complete. Apply incrementally alongside other phases.

1. Define the dark-mode-primary design token set in `tailwind.config.ts`: background layers (base, surface, elevated), foreground (primary, secondary, muted), border, and shadow tokens for dark and light modes.
2. Define the 6 accent colour presets as CSS custom property sets (e.g., `--accent-h`, `--accent-s`, `--accent-l` in HSL); implement a Zustand `themeSlice` that persists the chosen preset and applies it as a class on `<html>`.
3. Build the settings screen Theme section: 6 colour swatch buttons (no hex picker); a dark/light toggle.
4. Implement smooth theme transition: add a `transition-colors duration-200` on `html` so switching themes doesn't flash.
5. Build the app shell layout: fixed sidebar (240px), resizable via drag handle, main content area, title bar (Electron frameless window with draggable region), status bar.
6. Polish sidebar: hover states, active note highlight using accent colour, folder indentation, animated expand/collapse chevron.
7. Polish note header: breadcrumb showing folder path, emoji display (from frontmatter), editable title, save indicator, action buttons (delete, open in graph).
8. Polish editor typography: serif or readable sans-serif body font (Inter or iA Writer Quattro via local font stack), appropriate `prose` scale for headings; code blocks with monospace font and subtle background.
9. Polish graph view: smooth layout animation on node expansion, hover tooltip showing full note title, selected node ring in accent colour.
10. Add empty state illustrations (SVG, inline) for: no notes in folder, no search results, graph with single node.
11. Implement responsive breakpoints for the web layer (used by mobile): below 768px collapse sidebar into off-canvas drawer, adjust editor padding, hide some toolbar items behind a `...` overflow menu.

---

## Phase 11: Import / Export

Dependencies: Phase 2 complete.

1. Implement Anytype import: parse Anytype's exported `.md` / `.json` bundle format; map Anytype "relations" to frontmatter tags; map Anytype "links" to `[[Title]]` wiki-links; write output files into the vault.
2. Build the import UI: Settings → Import → choose file (`.zip` from Anytype export); show a preview of how many notes will be imported; confirm button runs the import with progress indicator.
3. Implement vault export to zip: use `archiver` npm package in the main process; zip the entire vault directory (including `.assets/`); prompt user for save location via Electron `dialog.showSaveDialog`.
4. Build the export UI: Settings → Export → "Export vault as ZIP" button; show progress and open the containing folder on completion.

---

## Phase 12: Polish & Hardening

Dependencies: All preceding phases substantially complete.

1. Audit all IPC channel handlers for input validation: sanitise all file paths to prevent directory traversal (resolve against vault root, reject paths outside).
2. Audit the sync server routes for the same path traversal concern; add a path-validation middleware that rejects any decoded path containing `..`.
3. Add rate limiting to the sync server using `express-rate-limit`; configure per-IP and per-token limits.
4. Implement graceful Electron app quit: if a sync is in progress, show a confirmation dialog; if unsaved editor changes exist, prompt; drain the write queue before exit.
5. Add error boundaries around the editor, graph, and search panel components; render a "Something went wrong" card with a reload button rather than a blank screen.
6. Implement a crash reporter in the Electron main process: catch uncaught exceptions, write a timestamped log to `app.getPath('logs')`; surface an in-app notification to the user.
7. Profile the index build with a vault of 1 000 notes: identify bottlenecks, move parsing off the main thread using a Worker (Node.js `worker_threads`) if build time exceeds 500ms.
8. Profile Lunr search with 1 000 notes: ensure query latency is under 50ms; if not, reduce indexed fields or switch to a trigram pre-filter.
9. Profile Cytoscape fcose layout with 500+ nodes: cap the full-graph node count with a warning at 300 nodes; enable Cytoscape's `wheelSensitivity` and `minZoom`/`maxZoom` bounds.
10. Write end-to-end tests using Playwright (Electron mode): vault open flow, create note, write content, rename, search, graph navigation, conflict resolution flow.
11. Audit accessibility: keyboard-only navigation through sidebar, editor, search, and graph; ARIA roles on custom components; colour contrast ratios meet WCAG AA.
12. Add `Content-Security-Policy` to the Electron `BrowserWindow` `webPreferences` and as a meta tag; restrict `script-src` to `'self'`; allow only `blob:` for image sources in the editor.
13. Test on a real Android device (not emulator): verify foreground service survives system-initiated process death, background sync fires correctly, gestures work at native resolution.
14. Test conflict resolution end-to-end: artificially produce a Syncthing conflict file and a server 412 response; walk through the full resolution flow.
15. Write `CHANGELOG.md` with a `v0.1.0` entry covering all shipped features; tag `v0.1.0` in git.

---

## Phase 13: Release

Dependencies: Phase 12 complete and all CI checks green.

1. Finalise `electron-builder` config: set production app id, version from `package.json`, Linux desktop entry categories, MIME type registration for `.md`.
2. Add GitHub Actions workflow `desktop-release.yml`: on `v*` tag, build AppImage and `.deb`, upload to GitHub Release.
3. Finalise Android Gradle release build config: set `versionCode` and `versionName` from env; sign with release keystore.
4. Add `android-release.yml` GitHub Actions workflow: on `v*` tag, build release AAB, upload to GitHub Release as artefact (sideload-ready; not Play Store submission).
5. Verify the OCI server image runs correctly with `docker run` using the documented single-command invocation; push final image to `ghcr.io` with `latest` and the version tag.
6. Write a `docs/getting-started.md` covering: install desktop app, open vault, configure Syncthing mode, configure server mode with Docker, install Android APK.
7. Create a `docs/sync-server.md` covering: environment variables, ETag conflict semantics, how to back up the vault directory, how to upgrade the container.
8. Tag `v1.0.0`, publish the GitHub Release with the AppImage, `.deb`, and AAB artefacts and the server OCI image digest.

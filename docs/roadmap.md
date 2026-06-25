# Roadmap — Notes App

> **Replaces:** `action-items.md` (13 horizontal phases)
>
> **Philosophy:** Vertical milestones — each one is a thin, usable end-to-end slice.
> Build the shallowest path through the whole system first, then add depth.
> Every milestone after M1 can be used daily.

---

## Milestones at a Glance

| M | Title | Epics | MVP? |
|---|---|---|---|
| M0 | Foundation | — | ✓ |
| M1 | Edit a note (desktop) | A, B, I | ✓ |
| M2 | Link notes | C | ✓ |
| M3 | Find notes | D | ✓ |
| M4 | Graph view | E | ✓ |
| M5 | Sync (Syncthing) | F, H(export) | ✓ |
| M6 | Android | G | ✓ |
| **── MVP boundary ──** | | | |
| M7 | Bundled sync server ✅ | F(server) | — |
| M8 | Anytype import ✅ | H(import) | — |

> **Post-MVP status:** M7 and M8 are now implemented and tested. The full app
> (M0–M8) ships desktop + Android, Syncthing **and** self-hosted server sync, plus
> Anytype import.

The MVP (M0–M6) delivers: Linux desktop + Android, plain-Markdown vault,
WYSIWYG editor, wiki-links with relationships, full-text search, graph view,
sync via the user's existing Syncthing, and conflict resolution.

---

## M0 — Foundation

**Goal:** A working monorepo that compiles, lints, tests, and has CI. No UI.

**Scope:**
- Git repo with `.gitignore` (node_modules, dist, out, .gradle, *.apk, *.aab, Electron artefacts)
- `pnpm-workspace.yaml` with granular packages per [ADR-0002](adr/0002-monorepo-structure.md)
- Root `tsconfig.base.json`: strict mode, `moduleResolution: bundler`, path aliases
- ESLint flat config: TypeScript rules, React rules, no-floating-promises
- Prettier at root
- Vitest: `vitest.workspace.ts` pointing at each package
- `packages/common`: `parseFrontmatter`, `serializeFrontmatter`, `parseWikiLinks`, `replaceWikiLinkTarget` — all with unit tests and fixtures
- GitHub Actions `ci.yml`: typecheck → lint → test on every push/PR to `main`

**Done when:** `pnpm typecheck && pnpm lint && pnpm test` all green in CI.

---

## M1 — Edit a Note (Desktop)

**Goal:** The app is usable as a daily note-taking tool on Linux. Every core editing
operation works. This milestone makes the project real.

**Scope:**
- Electron shell: `BrowserWindow`, secure `contextBridge`, IPC channel constants in `packages/common`
- `packages/vault`: `VaultFS` interface + Node.js implementation; `VaultScanner`; `NoteParser` (frontmatter parse, UUID check — **lazy only**, see [ADR-0006](adr/0006-note-identity-uuid.md)); atomic write (write-to-.tmp → rename); `chokidar` watcher
- `packages/editor`: ProseMirror schema (all standard nodes + marks per [ADR-0003](adr/0003-editor-prosemirror.md)), cursor-reveal plugin, syntax highlighting (7 languages), image paste → sibling folder (per [ADR-0005](adr/0005-attachment-storage.md)), table editor, input rules for Markdown shortcuts
- `packages/ui`: App shell (sidebar + editor pane), file tree (expand/collapse, context menu, keyboard nav), note header with editable title, frontmatter panel (tags, emoji, uuid, created/modified), auto-save (1s debounce) with dirty indicator
- Vault open: folder picker dialog, recent vaults list, persisted in Electron `app.getPath('userData')`
- Onboarding: empty vault → single "create your first note" hint; non-empty vault → confirmation before indexing
- Theming: dark mode primary, 6 accent presets, localStorage persistence ([ADR-0001](adr/0001-tech-stack.md))
- `electron-builder` config: AppImage + .deb targets, .md file association

**Done when:** Can open a vault, create a note, write formatted text, paste images,
create tables, rename a note, delete a note — all persisted as plain `.md` files,
readable in any text editor.

---

## M2 — Link Notes

**Goal:** Notes can reference each other with wiki-links and named relationships.
The knowledge graph exists in the files.

**Scope:**
- ProseMirror `wikilink` inline node (`[[Title]]` and `[[Title||TYPE]]` — [ADR-0011](adr/0011-wikilink-relationship-syntax.md))
- `[[` autocomplete: floating suggestions from `VaultIndex` title list, keyboard-navigable
- `||TYPE` autocomplete: surfaces previously used relationship types from `VaultIndex`
- Validation on blur: unresolved links decorated with "Note not found — create?" affordance
- Quick-peek overlay: hover (desktop) over a wikilink → read-only ProseMirror view of target note in floating panel; Escape or click-away dismisses
- Back-references: `backlinkIndex` in `VaultIndex`; displayed in the note's frontmatter panel as "Referenced by N notes"
- Rename propagation: `replaceWikiLinkTarget` (from `packages/common`) applied vault-wide, atomically, on file rename ([ADR-0009](adr/0009-sync-strategy.md) covers atomic writes)
- External rename detection: `unlink` + `add` within 500ms with identical content → treat as rename → trigger propagation

**Done when:** Can type `[[`, pick a note, add `||client of`, save — then rename the
target note and all links update automatically. Hovering a link shows the target note.

---

## M3 — Find Notes

**Goal:** Any note is reachable in under 3 keystrokes from anywhere in the app.

**Scope:**
- `packages/search`: Lunr.js index over `NoteRecord.bodyText` + `title`; incremental update (add/update/remove per note change); debounced full rebuild (1s after last change)
- Search query: wildcard suffix (`term*`) for substring; case-insensitive; body only (frontmatter excluded)
- Result shape: `{ noteId, title, snippet }` — snippet = 150-char window around first match with `<mark>` highlight
- Tag filter: multi-select chips; AND logic; bypasses Lunr when no query text, reads `tagIndex` directly
- Search UI: Command-palette modal triggered by `Ctrl+K`; 300ms debounce; title search, tag filter, vault-wide actions (new note, export, settings); keyboard navigation (↑↓ Enter); dismiss on selection or Escape
- Search result click: close modal, navigate to note, scroll to first match
- Month-based browsing in sidebar (grouped by `modified` date)

**Done when:** `Ctrl+K` → type 3 chars → note appears with matching snippet → Enter opens it.
Tag filter narrows results. Works instantly on a vault of several hundred notes.

---

## M4 — Graph View

**Goal:** The relationship graph is a daily navigation and discovery tool, available on all platforms.

**Scope:**
- `packages/graph`: Cytoscape element builder from `VaultIndex` (nodes = notes, edges = outlinks); [ADR-0008](adr/0008-graph-cytoscape.md)
- Default view: current note + depth-1 neighbours (filtered `elements` before Cytoscape mount, not hidden after)
- "Show full graph" toggle: replace filtered set with all nodes/edges, re-run fcose layout
- Interactive depth expansion: clicking a neighbour node extends the displayed subgraph by one hop
- Relationship-type filter: multi-select dropdown; re-filters elements and re-runs layout
- Node style: emoji (or first letter of title as fallback) as label; accent colour for focal node; muted for others; font-size scales with zoom via `mapData`
- Edge style: directional arrows; `relType` label; label visible above a zoom threshold only
- Hover tooltip: full note title + incoming back-reference count
- Click node → navigate to that note (updates focal node to clicked note)
- Pan/zoom: Cytoscape built-in; on-screen +/- buttons + reset; pinch-to-zoom (works on Android via Cytoscape touch support)
- Both outgoing and incoming edges included in depth-1 neighbourhood

**Done when:** Opening the graph from a note shows that note and its direct neighbours.
Can filter by relationship type. Clicking any node navigates to it. Works on mobile with pinch zoom.

---

## M5 — Sync (Syncthing)

**Goal:** The app coexists cleanly with an existing Syncthing setup and surfaces conflicts
with a clear resolution flow.

**Scope:**
- Atomic writes already in place from M1 (no partial files seen by Syncthing)
- No file locks held: `chokidar` watch-only; writes via atomic rename
- Conflict file detection: on `chokidar` `add` events, match Syncthing conflict filename pattern (`.sync-conflict-` infix); add to `conflictsSlice`
- 4-state sync dot: persistent, subtle, on every screen; states: solid green (idle), solid yellow (syncing), solid red (conflict/error), hollow red (no network); tap for details
- Conflict banner: non-blocking banner at top of a note that has a conflict counterpart; "This note has a conflict — tap to review"
- Conflict resolution UI: side-by-side diff view (line-level); left = current, right = conflict file; writable merge editor below pre-populated with current content; "Mark as resolved" button
- "Mark resolved": saves merged content to primary path, deletes conflict file, clears conflict from `conflictsSlice`
- Conflicts list panel: accessible from sync dot in conflict state; lists all unresolved conflicts by note title and timestamp
- Auto-refresh: external file change while editor is open + no local unsaved changes → silent reload; external change + local unsaved changes → treated as conflict ([ADR-0010](adr/0010-external-edit-reconciliation.md))
- Zip export: `archiver`-based; zips full vault (`.md` files + attachment sibling folders); Electron `showSaveDialog`

**Done when:** Syncthing creates a `.sync-conflict-` file → the dot turns red, the banner
appears in the affected note, side-by-side diff opens, user merges manually, "Mark resolved"
clears everything. Auto-refresh works when Syncthing delivers an updated file externally.

---

## M6 — Android

**Goal:** The full app runs on Android with native-feeling gestures, reliable background sync,
and close to desktop feature parity.

**Scope:**
- Capacitor shell in `apps/android/`: `cap init`, `@capacitor/android`, `capacitor.config.ts` pointing at `packages/ui/dist`
- `VaultPlugin` (Kotlin): `readFile`, `writeFile`, `listFiles`, `renameFile`, `deleteFile`, `statFile` — implements the `VaultFS` interface in the Capacitor sandbox
- `SyncForegroundService` (Kotlin): persistent foreground service; status bar notification (4-state icon variants); mtime-poll loop; posts broadcast intent on sync completion; starts on app open, survives until user stops it in settings; declares `FOREGROUND_SERVICE_TYPE_DATA_SYNC` in manifest (Android 14+)
- `SyncPlugin` (Kotlin): exposes `forceSync()` and `getSyncStatus()` to the web layer
- Web Worker index build: `VaultIndex.build()` runs in a Capacitor Web Worker; progress events populate the sidebar incrementally; target: <3s cold-start for ~500 notes on mid-range device
- mtime polling watcher: 30s interval when foregrounded; triggered by broadcast intent when backgrounded
- Gestures:
  - Edge swipe (within 20px of left edge) → sidebar via `@capacitor/gesture`
  - Long-press `[[link]]` (500ms touch hold) → quick-peek overlay
  - Pinch to zoom → graph (Cytoscape built-in)
  - Pull down on note list → `forceSync()`
- Responsive layout: below 768px sidebar collapses to off-canvas drawer; editor padding adjusted
- `AndroidManifest.xml`: internet permission, foreground service permission, `android:largeHeap="true"`
- CI: `android-build.yml` workflow: on `v*` tag, build signed release APK, upload to GitHub Releases (sideload; Play Store deferred)
- Gradle signing: keystore as encrypted CI secret

**Done when:** App installs via sideload APK. Notes are readable and editable. Background sync
fires while the app is closed and notes are up-to-date on open. All four gestures work at native
resolution. Cold start is under 3s.

---

## ── MVP Boundary ──

**M0–M6 = MVP.** Delivers: Linux desktop + Android; plain-Markdown vault; WYSIWYG editor;
wiki-links with named relationships; full-text search + tag filter; graph view; Syncthing sync
with conflict resolution. No proprietary services. Usable as a daily driver.

---

## M7 — Bundled Sync Server (post-MVP) — ✅ DONE

**Goal:** An alternative to Syncthing: a self-hosted, OCI-containerised sync server that the
user can run on their home server or VPS.

**Scope:**
- `server/` package: Node.js + Express; TypeScript compiled to CommonJS
- API per [ADR-0009](adr/0009-sync-strategy.md): `GET /api/files`, `GET /api/files/:path`, `PUT /api/files/:path` (with `If-Match`), `DELETE /api/files/:path`, `GET /api/health`
- Auth: `Authorization: Bearer $SYNC_TOKEN` middleware; no expiry/rotation
- Conflict: `409 Conflict` when `If-Match` ETag mismatches; server-side content in response body
- ETag: SHA-256 of file content, first 16 hex chars; stored in `.meta/` sidecar JSON
- HTTPS via reverse proxy (Caddy/nginx); server listens on HTTP/8080
- `Dockerfile`: multi-stage build; `VAULT_DIR=/data`, `SYNC_TOKEN`, `PORT=8080`; `VOLUME ["/data"]`
- Desktop sync client (`SyncEngine`): poll `/api/files` on 60s interval; push local-newer files; pull server-newer files; on `409` write conflict file and trigger M5 conflict flow
- Mobile sync client: same protocol via `SyncPlugin`/`SyncForegroundService`; 120s interval background
- Settings screen: radio (Syncthing / Server / None), server URL + token inputs, test-connection button
- ETag cache persisted to `app.getPath('userData')` JSON; survives restarts
- Integration tests for all routes: supertest; happy path, 409, 401, 404
- `ghcr.io` publish in `release-desktop.yml` CI workflow

**Done when:** `docker run -e SYNC_TOKEN=… -v /my/vault:/data ghcr.io/…/notesthingy-server`
starts the server. Desktop and Android clients sync to it. Conflicts surface via the M5 flow.

---

## M8 — Anytype Import (post-MVP) — ✅ DONE

**Goal:** Migrate the user's existing data from Anytype into the vault.

**Scope:**
- Parse Anytype's exported `.md`/`.json` bundle format
- Map Anytype "relations" → YAML frontmatter tags
- Map Anytype internal links → `[[Title]]` wiki-links
- Write output `.md` files into the vault
- Import UI: Settings → Import → file picker (`.zip`); preview (note count + mapping summary); progress indicator
- Attachment handling: TBD — volume and Anytype attachment types not yet specified in requirements

**Note:** The exact Anytype export schema must be confirmed before implementation starts.
Requirements mark this as TBD on volume/attachment types.

---

## What Was Removed or Scaled Back vs. `action-items.md`

| Removed / scaled back | Reason |
|---|---|
| Rate-limiting per-IP/per-token on sync server | Single-user server; no threat model that justifies it |
| WCAG-AA contrast audit | `requirements.md` explicitly states no a11y requirements |
| 1,000-note profiling sprint (3 items) | Scale is "hundreds, will not reach 1,000" — a sanity check suffices, not a dedicated phase |
| 13 horizontal phases building complete subsystems before integration | Replaced by vertical milestones; M1 is usable, every subsequent milestone adds a complete feature |
| Phase 12 "Polish & Hardening" as a separate phase | Path-traversal input validation (was 12.1/12.2) is included in M1 (IPC handlers) and M7 (server). Other items are folded into relevant milestones. |
| Flatpak packaging | Deferred indefinitely (Electron sandbox + Flatpak filesystem portal complexity, no user demand yet) |
| Play Store distribution | Deferred (requires privacy policy, compliance review; sideload APK covers personal use) |

---

## Requirements Coverage Cross-Check

Every functional requirement from `requirements.md` mapped to its milestone.

| Requirement | Milestone |
|---|---|
| Plain Markdown files, nested folders | M1 |
| Files editable outside the app | M1 (files first principle) |
| Greppable on disk | M1 |
| Images embedded in note-adjacent sibling folder | M1 |
| Larger files linked, not embedded | M1 |
| Note title = filename | M1 |
| YAML frontmatter (tags, emoji, created, modified) | M1 |
| WYSIWYG editor, cursor-position reveal (Typora style) | M1 |
| Standard Markdown features | M1 |
| Syntax highlighting — 7 languages | M1 |
| Visual table editor (drag rows/cols, add/remove) | M1 |
| Direct image paste | M1 |
| Auto-save | M1 |
| Dense information layout | M1 |
| Dark mode primary, 6 accent presets (no hex picker) | M1 |
| Onboarding — empty vault hint | M1 |
| Onboarding — confirmation before indexing existing vault | M1 |
| Sidebar hidden while writing, on-demand | M1 |
| Rename propagation of `[[links]]` | M2 |
| Wikilink `[[Title]]` and `[[Title\|\|TYPE]]` syntax | M2 |
| User-defined relationship types, autocomplete | M2 |
| Validation warning for missing link target + "create?" | M2 |
| Quick-peek read-only overlay | M2 |
| Full-text search (body only, not frontmatter) | M3 |
| Case-insensitive exact substring search | M3 |
| Search results: title + snippet, debounced 300ms, modal overlay | M3 |
| Tag search & filter (flat, vault-wide) | M3 |
| Command palette (`Ctrl+K`) | M3 |
| Graph view — nodes, directional named edges | M4 |
| Graph — emoji node labels | M4 |
| Graph — default depth-1 view, expandable | M4 |
| Graph — filterable by relationship type | M4 |
| Graph — pan, zoom, click to navigate | M4 |
| Graph — outgoing + incoming per node | M4 |
| No proprietary sync | M5 |
| Syncthing coexistence | M5 |
| Conflict resolution — side-by-side, manual merge, "Mark resolved" | M5 |
| 4-state sync status dot | M5 |
| Full offline support | M5 |
| Auto-refresh when files change externally | M5 |
| Export vault to ZIP | M5 |
| Android — read, write, search | M6 |
| Android — background sync (foreground service) | M6 |
| Android — edge swipe, long-press, pinch zoom, pull-to-sync | M6 |
| Android — close to desktop parity | M6 |
| Bundled self-hosted sync server (OCI image) | M7 |
| Anytype import | M8 |
| Light mode (not required, but theming system allows it) | M1 (token layer; full light mode later) |

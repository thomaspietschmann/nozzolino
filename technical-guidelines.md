# Technical Guidelines — Personal Notes App

> Status: Authoritative. These are decisions, not proposals.

---

## 1. Tech Stack

### Desktop (Linux)

- **Runtime**: Node.js via Electron
- **UI Framework**: React 18 with TypeScript
- **Renderer**: Chromium (Electron's built-in) — acceptable per requirements, and it gives us a unified DOM environment across desktop and mobile web views
- **IPC**: Electron's `contextBridge` + `ipcRenderer`/`ipcMain` with typed channels
- **Build tool**: Vite (fast HMR, native ESM, excellent TypeScript support)

Electron is chosen over Tauri because the editor engine (ProseMirror) is JavaScript-native and we want zero serialization overhead between the editor and the file system layer. Tauri's Rust core would add a translation boundary with no compensating benefit at this scale.

### Mobile (Android)

- **Runtime**: Capacitor wrapping the same React application
- **Native layer**: Capacitor plugins (Filesystem, Background Runner) written in Kotlin
- **Minimum API**: 26 (Android 8) — required for reliable foreground service behaviour

Capacitor is chosen over React Native because we share 100% of the React component tree and editor code with the desktop build. React Native's bridge and separate component model would require maintaining two UI trees.

### Shared

- **Language**: TypeScript throughout — app code, editor extensions, sync logic, and the server
- **State management**: Zustand (minimal boilerplate, works with React 18 concurrent mode)
- **Styling**: Tailwind CSS with a small design-token layer for accent colors and dark mode

---

## 2. Project Structure

Monorepo managed with **pnpm workspaces**.

```
notesthingy/
├── apps/
│   ├── desktop/          # Electron shell + main process
│   └── android/          # Capacitor project + Kotlin plugins
├── packages/
│   ├── ui/               # All React components, shared 100%
│   ├── editor/           # ProseMirror schema + extensions
│   ├── vault/            # File system abstraction, watcher, indexer
│   ├── search/           # Lunr index wrapper
│   ├── graph/            # Cytoscape data model + layout helpers
│   ├── sync/             # Sync client (Syncthing poller + bundled server client)
│   └── common/           # Shared types, constants, utilities
├── server/               # Bundled sync server (Node.js)
├── docker/               # OCI image build context
└── pnpm-workspace.yaml
```

`packages/ui`, `packages/editor`, `packages/vault`, `packages/search`, and `packages/graph` are platform-agnostic TypeScript. The file system calls inside `packages/vault` go through an interface (`VaultFS`) with two concrete implementations: one using Node's `fs` module (desktop) and one using the Capacitor Filesystem plugin (Android). Nothing else in the shared packages touches the platform directly.

---

## 3. Editor Engine

**Library: ProseMirror**

ProseMirror is chosen over TipTap, Quill, and Milkdown because:

- It exposes the full schema and transaction model — essential for implementing custom `[[wikilink]]` nodes and the relationship syntax `[[Title||TYPE]]`
- Typora-style cursor-reveal (hiding raw Markdown syntax everywhere except at the cursor) requires precise decoration control that only ProseMirror's decoration API provides cleanly
- It handles large documents without virtualization — fine at our scale
- It is stable, battle-tested, and has no vendor lock-in

TipTap is a ProseMirror wrapper we explicitly avoid — it adds a React abstraction layer that fights with the decoration model we need.

### Schema Extensions

The base schema uses `prosemirror-markdown` for standard Markdown nodes. Custom extensions added on top:

| Extension | Implementation |
|---|---|
| `wikilink` | Inline node. Input rule triggers on `[[`. Renders as a styled span; exposes `href` (title) and optional `rel` (relationship type) attrs. |
| `wikilink-hover` | Plugin. On `mouseover` of a wikilink node, opens the quick-peek panel via Zustand action. |
| `cursor-reveal` | Plugin. Maintains a `DecorationSet` that strips render-hiding decorations from the current block and re-applies them on blur/cursor-leave. |
| `syntax-highlight` | Node view for `code_block` using `highlight.js` with the seven required languages registered. |
| `table-drag` | Node view wrapping ProseMirror's `prosemirror-tables` with drag handles for rows and columns. |
| `image-paste` | `handlePaste` plugin. Intercepts `image/*` clipboard data, writes to the attachment folder via `VaultFS`, inserts an `image` node with the relative path. |

### Wikilink Parsing

Input rule: on `[[` typed, open an autocomplete dropdown (Zustand-driven) sourcing from the in-memory title index. On confirm, insert a `wikilink` node. On `]]` close, commit. The node stores the raw title string; resolution to a file path happens at render time via the index.

Relationship type is the text after `||` within the node's `rel` attribute. Autocomplete for `rel` surfaces all previously used relationship types from the index.

---

## 4. Data Model

### On-Disk Format

Each note is a `.md` file. The filename (without extension) is the canonical title and the target of `[[links]]`.

```markdown
---
tags: [architecture, backend]
emoji: 🗄️
created: 2026-01-15T10:30:00Z
modified: 2026-06-20T14:22:11Z
---

# Sync Architecture

Body content here. Links use [[Note Title]] or [[Note Title||DEPENDS_ON]] syntax.
```

Rules:
- YAML frontmatter is always present (written on first save if absent)
- `tags` is a YAML list; never a comma-string
- `emoji` is optional; omitting it means the graph renders the first letter of the title
- `created` and `modified` are ISO 8601 UTC; `modified` is updated by the app on every save
- The `# H1` heading is optional and independent of the filename/title

### Attachment Storage

For a note at `vault/projects/my-note.md`, attachments live at `vault/projects/my-note/`. The path is `<note-stem>/<filename>`. References in the note body are relative: `![](my-note/image.png)`.

Larger linked files (PDFs etc.) are referenced with standard Markdown links and stored anywhere in the vault tree — the app does not manage them specially.

### In-Memory Index

The `VaultIndex` (in `packages/vault`) is built at startup and kept live by the file watcher. It is a plain TypeScript object, serialised to nothing — it is rebuilt from disk on every cold start.

```typescript
interface NoteRecord {
  id: string;           // stable UUID stored in frontmatter; added on first index if absent
  path: string;         // absolute path on disk
  title: string;        // filename stem
  emoji: string | null;
  tags: string[];
  outlinks: Outlink[];  // parsed [[wikilink]] and [[wikilink||TYPE]] references
  modified: Date;
  bodyText: string;     // full plain text, stripped of Markdown syntax, for search
}

interface Outlink {
  targetTitle: string;
  relationshipType: string | null;
}
```

The index also maintains:
- `titleToPath: Map<string, string>` — for link resolution
- `tagIndex: Map<string, Set<string>>` — tag → set of note IDs
- `backlinkIndex: Map<string, Outlink[]>` — target title → incoming links

`id` is a UUIDv4 written into frontmatter on the note's first indexing. It is the stable identifier used by the sync server and conflict detection. The filename (title) is the human-visible identity; the UUID is the machine identity.

---

## 5. File Watcher & Index

### Watcher

**Desktop**: `chokidar` watching the vault root recursively. Events: `add`, `change`, `unlink`. Debounce 500ms per path before re-indexing that file (handles editors that do multiple rapid writes).

**Android**: Capacitor's Background Runner plugin polls for `mtime` changes on a 30-second interval when the app is foregrounded, and on sync completion events when backgrounded. Full inotify-style watching is not available in the Capacitor sandbox.

### Index Rebuild Strategy

On a `change` event for a single file: re-parse that file, update `NoteRecord`, patch `titleToPath`, `tagIndex`, and `backlinkIndex` incrementally. Full rebuild only on vault open or on structural events (folder rename, vault root change).

Index build time for 1,000 notes is under 200ms on any modern machine — no async chunking is needed. The index is rebuilt synchronously in the main process on desktop and in a Capacitor Web Worker on Android to avoid blocking the UI thread.

### What Is Persisted

Nothing in the index is persisted to disk. The source of truth is always the `.md` files. The index is a runtime cache. This means cold-start always reads all files, which is acceptable at <1,000 notes.

The one exception: the `id` UUID field. If a note lacks one, the indexer adds it to the frontmatter and writes the file back immediately. This is a one-time migration on first open.

---

## 6. Search Architecture

**Library: Lunr.js**

At <1,000 notes, a full in-process inverted index is correct. No server, no SQLite FTS, no external process.

The Lunr index is built in `packages/search` over `NoteRecord.bodyText` and `NoteRecord.title`. It is rebuilt whenever the `VaultIndex` changes (debounced 1s after the last change event).

### Query Behaviour

- **Full-text search**: Lunr wildcard query (`title:term* body:term*`) — case-insensitive, substring match
- **Tag filter**: applied post-Lunr as a set intersection on `NoteRecord.tags`
- **Result shape**: `{ noteId, title, snippet }` — snippet is extracted by finding the first 150-character window in `bodyText` containing the query term
- **Debounce**: 300ms from last keystroke before query fires (in the UI layer)

The search modal renders results as a virtualised flat list (react-window) — necessary if a query returns many results even at small scale, and it costs nothing to add.

Tag-only filtering (no text query) bypasses Lunr entirely and reads directly from `tagIndex`.

---

## 7. Graph View

**Library: Cytoscape.js** with the `cytoscape-fcose` force-directed layout plugin.

Cytoscape is chosen over D3-force, Sigma.js, and vis-network because:
- It has a clean React integration via `react-cytoscapejs`
- `fcose` produces stable, aesthetically good layouts without manual tuning
- Its node/edge model maps directly to our `NoteRecord` + `Outlink` structure
- It handles pinch-to-zoom and pan natively on touch, which covers the Android requirement

### Data Structure

```typescript
// Translated from VaultIndex before passing to Cytoscape
const elements = [
  { data: { id: note.id, label: note.emoji ?? note.title[0], title: note.title } },
  // ... one per NoteRecord
  { data: { id: `${outlink.sourceId}->${outlink.targetId}-${outlink.type}`,
            source: outlink.sourceId,
            target: outlink.targetId,
            label: outlink.type ?? '' } },
  // ... one per Outlink with a resolved target
];
```

### Layout

`fcose` is run once on mount. The layout result is not persisted — re-opening the graph re-runs the layout. This is explicitly permitted by the requirements.

Default view: current note + its direct neighbours (depth 1). A "Show full graph" button switches to all nodes. Depth is implemented by filtering `elements` before passing to Cytoscape, not by hiding nodes after layout.

Relationship type filtering: re-filter `elements` and re-run layout. Cheap at this scale.

Clicking a node fires a Zustand action to open that note. Hovering a node shows a tooltip with title and incoming back-reference count. The emoji is the node label; font size scales with zoom level via Cytoscape's `font-size` style bound to `mapData`.

---

## 8. Sync Architecture

### Mode 1: Syncthing

The app does not bundle or manage Syncthing. The user runs Syncthing independently. The app's only obligation is:

1. Watch for external file changes via `chokidar` (desktop) / polling (Android) and re-index
2. Write files atomically (write to `.tmp`, then rename) to avoid Syncthing picking up partial writes
3. Detect conflict files — Syncthing names them `note.sync-conflict-*.md` — surface them via the conflict resolution UI
4. Never hold file locks

No further integration is needed. Syncthing handles transport, encryption, and delta sync.

### Mode 2: Bundled Sync Server

The bundled server is a **Node.js HTTP server** (`server/` package) that implements a minimal file sync protocol over HTTPS.

It is not a generic sync framework. It is purpose-built for this app:

- Stores files in a directory on the server (the vault mirror)
- Exposes endpoints for: list files with mtimes+etags, upload file, download file, delete file
- Clients poll on a configurable interval (default 60s on desktop, 120s on Android background)
- Uses **last-write-wins** with a conflict escalation path (see below)

#### Conflict Detection

Each file carries an `ETag` (SHA-256 of content, hex-truncated to 16 chars) stored server-side in a sidecar `.meta.json` file alongside each note.

On upload, the client sends `If-Match: <last-known-etag>`. If the server's current ETag differs, it means another client wrote in the interim:

1. Server returns `409 Conflict` with the server-side content in the body
2. Client stores the conflicting version alongside the local version in `VaultIndex` as a `ConflictRecord`
3. App surfaces the non-blocking conflict banner
4. User opens the side-by-side diff, manually edits the merged result in the left pane, confirms
5. Client uploads the resolved content with the server's ETag as `If-Match` — succeeds because nothing else changed it
6. `ConflictRecord` cleared from index

There is no three-way merge and no CRDT. The requirements specify manual merge; this implements exactly that.

### OCI Image

```
server/
├── Dockerfile
├── src/
│   ├── index.ts        # Express app, route handlers
│   ├── auth.ts         # Token middleware
│   ├── storage.ts      # File read/write with meta sidecar
│   └── conflict.ts     # ETag comparison, 409 response shape
└── package.json
```

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ ./dist/
EXPOSE 8080
VOLUME ["/data"]
ENV VAULT_DIR=/data SYNC_TOKEN=changeme
CMD ["node", "dist/index.js"]
```

The image is built with `docker buildx` and published to GitHub Container Registry (`ghcr.io/owner/notesthingy-server`). A single `docker run` with `SYNC_TOKEN` and a volume mount is the full deployment.

---

## 9. Rename Propagation

When a note is renamed (filename change), all `[[OldTitle]]` and `[[OldTitle||TYPE]]` references vault-wide must be updated to `[[NewTitle]]` and `[[NewTitle||TYPE]]`.

### Algorithm

```
function propagateRename(oldTitle: string, newTitle: string, index: VaultIndex): void {
  const affectedPaths = backlinkIndex.get(oldTitle)
    .map(outlink => titleToPath.get(outlink.sourceTitle))
    .filter(Boolean);

  for (const filePath of affectedPaths) {
    const content = fs.readFileSync(filePath, 'utf8');
    const updated = content
      .replace(
        new RegExp(`\\[\\[${escapeRegex(oldTitle)}(\\|\\|[^\\]]*)?\\]\\]`, 'g'),
        (_, rel) => `[[${newTitle}${rel ?? ''}]]`
      );
    atomicWrite(filePath, updated);
  }

  // Update the physical file
  fs.renameSync(titleToPath.get(oldTitle), titleToPath.get(oldTitle).replace(oldTitle, newTitle));

  // Patch index
  index.reindex(affectedPaths);
  index.reindex([newPath]);
}
```

`atomicWrite` writes to `<path>.tmp` then `fs.renameSync` to the final path — ensuring Syncthing and the OS never see a partial file.

The rename is presented to the user as an immediate operation. If the vault has 1,000 notes all linking to one note, the worst-case rewrite is still <50ms on any SSD.

Rename is initiated only from within the app (file rename in the sidebar). Renames made externally (outside the app) are detected by the watcher as an `unlink` + `add` event pair; if they occur within 500ms and the content is identical minus frontmatter, the app treats it as a rename and triggers propagation. Otherwise it is treated as a delete + new note.

---

## 10. Mobile Specifics

### Background Sync — Foreground Service

Android kills background processes aggressively. Sync on Android uses a **persistent foreground service** implemented as a Capacitor plugin in Kotlin (`apps/android/app/src/main/kotlin/SyncService.kt`).

The service:
- Starts when the app first opens, persists until the user explicitly stops sync in settings
- Shows a permanent status bar notification (four-state dot rendered as a notification icon variant: solid green / solid yellow / solid red / hollow red)
- Polls the sync server (or checks Syncthing's REST API) on a configurable interval
- Writes changed files to the Capacitor Filesystem path (app-scoped external storage)
- Posts a broadcast intent the Capacitor Web Worker listens to, triggering an index patch

The foreground service is started via `startForegroundService()` and declares `FOREGROUND_SERVICE_TYPE_DATA_SYNC` in the manifest (required Android 14+).

### Cold-Start Strategy

On cold start (app process killed):

1. Capacitor WebView loads the React bundle from local assets — no network needed
2. Main thread renders the shell (sidebar + empty editor pane) immediately
3. A `VaultIndex.build()` call runs in a Web Worker, posting progress events
4. As each batch of notes is indexed, the sidebar file list populates incrementally
5. Search and graph are available once the index is complete (typically <3s for 1,000 notes on mid-range Android)

The foreground service continues running during cold start and resumes syncing independently. If a sync completes during indexing, the new/changed files are queued and applied to the index after the initial build finishes.

### Gesture Implementation

| Gesture | Implementation |
|---|---|
| Edge swipe → sidebar | Capacitor's native gesture plugin (`@capacitor/gesture`) — more reliable than CSS-only solutions at the screen edge |
| Long press `[[link]]` → quick-peek | ProseMirror plugin listening to `touchstart` + 500ms timer |
| Pinch to zoom → graph | Cytoscape's built-in touch zoom |
| Pull down → force sync | A custom pull-to-refresh component above the note list that fires a Zustand action `sync.forcePull()` |

---

## 11. Sync Server

**Technology: Node.js with Express, TypeScript, compiled to CommonJS with `tsc`**

Express is chosen for its simplicity. No ORM, no database — files are the storage. The server has no persistent state beyond the files in `$VAULT_DIR` and their `.meta.json` sidecars.

### API Surface

```
GET    /api/files              → [{ path, etag, mtime }]
GET    /api/files/:path        → file content (binary)
PUT    /api/files/:path        → upload (body = file content); header If-Match for conflict check
DELETE /api/files/:path        → delete file
GET    /api/health             → { ok: true, version }
```

All routes require `Authorization: Bearer <token>` where the token is the value of the `SYNC_TOKEN` environment variable. No token expiry, no rotation — single-user, self-hosted, kept simple.

HTTPS is handled by a reverse proxy (Caddy or nginx) in front of the container. The server itself listens on HTTP only. The OCI image exposes port 8080.

### Meta Sidecar

For a note at `/data/projects/my-note.md`, the sidecar is `/data/.meta/projects/my-note.md.json`:

```json
{ "etag": "a3f9c2d1b4e87f20", "mtime": "2026-06-20T14:22:11Z" }
```

The sidecar directory is hidden (`.meta/`) and excluded from file listings returned to clients.

---

## 12. Theming

### Dark Mode

Dark mode is the primary design target. The app ships with two base themes: dark and light. System preference is detected via `window.matchMedia('(prefers-color-scheme: dark)')` and stored in `localStorage` so the user's explicit choice persists across restarts.

Tailwind's `darkMode: 'class'` strategy is used. A `data-theme` attribute on `<html>` drives which class is active. Theme switching is instant — a single class toggle, no page reload.

### Accent Color Presets

Accent colors are **not** user-defined hex values. The app ships exactly six presets:

| Name | Hue |
|---|---|
| Indigo | #6366f1 |
| Teal | #14b8a6 |
| Rose | #f43f5e |
| Amber | #f59e0b |
| Violet | #8b5cf6 |
| Slate | #64748b |

Each preset is a CSS custom property set applied to `:root`. The active preset is stored in `localStorage`.

```css
/* Example: Indigo preset */
[data-accent="indigo"] {
  --accent-500: #6366f1;
  --accent-400: #818cf8;
  --accent-600: #4f46e5;
  --accent-foreground: #ffffff;
}
```

All interactive elements (links, active sidebar items, focus rings, graph node highlight) reference `var(--accent-500)` — not a hardcoded Tailwind color class. Switching presets requires setting one `data-accent` attribute on `<html>`.

No hex picker. Adding new presets in the future is a CSS-only change.

---

## 13. Build & Packaging

### Desktop (Linux)

**Build pipeline**: `vite build` for the renderer, `tsc` for the main process, `electron-builder` for packaging.

```
pnpm --filter desktop build
  → vite build (renderer → dist/renderer/)
  → tsc (main process → dist/main/)
  → electron-builder (packages → release/)
```

`electron-builder` produces:
- `.deb` for Debian/Ubuntu
- `.rpm` for Fedora/RHEL
- `.AppImage` for distribution-agnostic installs
- Optionally a Flatpak manifest (TBD — see below)

Auto-update: `electron-updater` against a GitHub Releases feed. The app checks for updates on launch and notifies the user non-intrusively. Update download and install happen in the background; the user restarts to apply.

Code signing: GPG-signed `.deb`/`.rpm` packages. AppImage does not require signing but the binary is SHA256-checksummed in the release manifest.

### Android

**Build pipeline**: Capacitor + Android Gradle.

```
pnpm --filter ui build           # shared React bundle → dist/
pnpm --filter android cap sync   # copies dist/ into Capacitor android project
cd apps/android && ./gradlew assembleRelease
```

Distribution: GitHub Releases as a signed `.apk` (direct sideload). The Play Store is a TBD — it requires a privacy policy and ongoing compliance review; defer until post-MVP.

Signing: a keystore checked into the repo as an encrypted secret (decrypted in CI via environment variable). `gradle.properties` references the keystore path and credentials.

### CI

GitHub Actions. Three workflows:
1. `ci.yml` — lint, typecheck, unit tests on every PR
2. `release-desktop.yml` — triggered on `v*` tag; builds and uploads Linux packages to GitHub Releases
3. `release-android.yml` — triggered on `v*` tag; builds and uploads signed APK to GitHub Releases

The sync server OCI image is built and pushed to `ghcr.io` in `release-desktop.yml` since versioning is tied to the same tag.

### TBD Items

Two decisions are deliberately deferred:

1. **Flatpak packaging**: Requires Electron's sandbox to be properly configured for the Flatpak sandbox, and the Syncthing integration path needs to be validated against Flatpak's filesystem portal. Defer to post-MVP.

2. **Play Store distribution**: Requires privacy policy, content rating, and compliance with Play Store policies around self-hosted sync. The APK sideload path covers the personal-use case at MVP. Revisit when there is user demand for managed distribution.

These are the only two open items. Everything else in this document is decided.

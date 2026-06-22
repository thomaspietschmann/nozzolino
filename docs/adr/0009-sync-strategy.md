# ADR-0009: Sync Strategy

- **Date:** 2026-06-22
- **Status:** Accepted
- **Source:** `technical-guidelines.md` §8, §11 (Authoritative)
- **Resolves conflict:** See `source-reconciliation.md` — Conflict 3

---

## Context

The user explicitly rejects proprietary sync services. They already run Syncthing between
their devices. For the MVP, Syncthing is the primary sync mechanism. A self-hosted OCI-
containerised sync server is a post-MVP option (M7).

Core principles:
- Full offline support — app works without network
- Auto-refresh when files change externally
- Conflicts are surfaced to the user for manual resolution; no automatic merge
- Single-user only

---

## Decision

### Mode 1: Syncthing (MVP — M5)

The app does **not** bundle or manage Syncthing. The user runs Syncthing independently.
The app's obligations are:

1. **Atomic writes:** All file writes go through `atomicWrite(path, content)`:
   write to `<path>.tmp` then `fs.renameSync` to the final path. Syncthing never sees a
   partial file.
2. **No file locks:** `chokidar` is watch-only. The app never holds an exclusive file lock.
3. **Conflict file detection:** Syncthing names conflict copies `note.sync-conflict-*.md`.
   The `chokidar` watcher detects `add` events matching this pattern and routes them to
   the `conflictsSlice`.
4. **Auto-refresh:** External `change` events from `chokidar` (or mtime polling on Android)
   trigger re-indexing. Behaviour when the editor is open: see [ADR-0010](0010-external-edit-reconciliation.md).

No further Syncthing integration is needed. Syncthing handles transport, encryption, delta sync.

### Mode 2: Bundled Sync Server (post-MVP — M7)

A minimal Node.js + Express sync server in `server/`. Purpose-built for this app;
not a generic sync framework.

#### API (authoritative — from `technical-guidelines.md` §11)

```
GET    /api/files              → [{ path, etag, mtime }]
GET    /api/files/:path        → file content (binary)
PUT    /api/files/:path        → upload; If-Match header for conflict check
DELETE /api/files/:path        → delete file
GET    /api/health             → { ok: true, version }
```

- Base path: `/api/files` (not `/notes` as written in `action-items.md`)
- Port: `8080` (not `3000`)
- Auth env var: `SYNC_TOKEN` (not `AUTH_TOKEN`)
- Conflict response: `409 Conflict` (not `412 Precondition Failed`)

#### Conflict detection

Each file carries an ETag (SHA-256 of content, first 16 hex chars). On upload, the client
sends `If-Match: <last-known-etag>`. If the server's current ETag differs:

1. Server returns `409 Conflict` with the server-side content in the body
2. Client stores the conflicting version in `VaultIndex` as a `ConflictRecord`
3. The M5 conflict resolution UI is re-used (same flow as Syncthing conflict)

No three-way merge, no CRDT. Manual merge only.

#### OCI image

```
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

Single `docker run` with `SYNC_TOKEN` env var and a volume mount is the full deployment.
HTTPS is handled by a reverse proxy (Caddy or nginx) in front of the container.

### Sync status

The 4-state sync dot on every screen:

| State | Visual | Meaning |
|---|---|---|
| Synced | Solid green | Fully synced, no issues |
| Syncing | Solid yellow | Sync in progress |
| Conflict/error | Solid red | Conflict detected or server unreachable / file permission error |
| No network | Hollow red circle | No network connection |

---

## Consequences

- **Syncthing mode requires no setup in the app.** The user manages Syncthing independently.
  The app cannot know the sync state in Syncthing mode — the sync dot shows "synced" whenever
  no conflict files are detected, which is an approximation.
- **Server mode (M7)** gives precise sync state (the client knows exactly which files have
  been acknowledged by the server).
- **Atomic writes** mean the app briefly creates a `.tmp` file next to every note on save.
  Syncthing will ignore `.tmp` files if the user adds `**.tmp` to the Syncthing ignore list.
  This is a recommendation to document, not an automatic configuration.
- **No rate limiting** on the sync server. This is a single-user, self-hosted server.
  Rate limiting would add complexity with no security benefit. (This overrides
  `action-items.md` Phase 12 item 3.)

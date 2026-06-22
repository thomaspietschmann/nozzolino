# ADR-0002: Monorepo Package Structure

- **Date:** 2026-06-22
- **Status:** Accepted
- **Source:** `technical-guidelines.md` §2 (Authoritative)
- **Resolves conflict:** See `source-reconciliation.md` — Conflict 2

---

## Context

The project spans two platform targets (Electron desktop, Capacitor Android) and a
server component. The core logic (editor, vault file handling, search, graph) must be
shared 100% without duplication. The `action-items.md` proposed a coarser structure
that collapsed all shared logic into a single `packages/app` package, which would blur
the boundaries between distinct subsystems.

---

## Decision

pnpm workspaces monorepo with the following package layout:

```
notesthingy/
├── apps/
│   ├── desktop/          # Electron shell — main.ts, preload.ts, electron-builder config
│   └── android/          # Capacitor project — Kotlin plugins, AndroidManifest.xml
├── packages/
│   ├── ui/               # All React components — shared 100% between desktop and Android
│   ├── editor/           # ProseMirror schema, plugins, extensions
│   ├── vault/            # VaultFS interface + implementations, NoteParser, VaultIndex, chokidar watcher
│   ├── search/           # Lunr index wrapper, indexer, query function
│   ├── graph/            # Cytoscape element builder, layout helpers
│   ├── sync/             # Sync client (Syncthing poller + server client)
│   └── common/           # Shared types, constants, utility functions, IPC channel names
├── server/               # Bundled sync server (Node.js + Express)
├── docker/               # Dockerfile, docker-compose.yml
└── pnpm-workspace.yaml
```

### Platform abstraction

`packages/vault` exposes a `VaultFS` interface. Two concrete implementations:
- `NodeVaultFS`: uses Node.js `fs` module (desktop main process)
- `CapacitorVaultFS`: uses `@capacitor/filesystem` plugin (Android)

Nothing else in the shared packages (`ui`, `editor`, `search`, `graph`) touches the
platform directly. All file I/O flows through `VaultFS`.

---

## Rationale

**Granularity reflects real dependency boundaries:**
The editor (`packages/editor`) depends on ProseMirror but has no knowledge of files.
The vault (`packages/vault`) handles files but has no knowledge of UI.
Search (`packages/search`) depends on vault for the index input but not on the editor.
Keeping them separate makes the dependency graph explicit and prevents accidental coupling.

**`VaultFS` abstraction is the key seam:**
Desktop and Android differ in exactly one thing: how they read and write files. Isolating
that difference in one interface means the rest of the codebase is platform-agnostic TypeScript.

**`packages/common` as the lowest-level package:**
No package depends on `common` being platform-specific. It holds only types, constants,
regex patterns, and pure utility functions. It has no dependencies other than TypeScript itself.

**Overrides `action-items.md`:**
The `action-items.md` structure (`packages/{app,desktop,mobile,server,shared}`) collapses
editor, vault, search, graph, and sync into a single `app` package. This was rejected because
it would: (a) make the `VaultFS` abstraction awkward to enforce, (b) prevent independent
versioning and testing of each subsystem, and (c) prevent running e.g. the search tests
without loading the editor.

---

## Consequences

- More `package.json` files to maintain. Accepted — the boundary clarity is worth the overhead.
- Cross-package TypeScript path aliases must be configured in `tsconfig.base.json` and referenced
  in each package's `tsconfig.json`. The Vite and Jest/Vitest configs in each package must also
  resolve workspace aliases.
- Adding a new shared utility means deciding which package it belongs to. This is intentional —
  it prevents the "common" package from becoming a dumping ground.

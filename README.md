# notes-app

A self-hosted, cross-platform note-taking app for personal use. Notes are stored as plain Markdown files on disk — no proprietary database, no vendor lock-in. Sync runs through your own Syncthing setup or a self-hosted server you control.

Runs on **Linux desktop** (Electron) and **Android** (Capacitor). Both platforms share the same React codebase.

---

## Requirements

| Tool | Version |
|---|---|
| [Node.js](https://nodejs.org/) | ≥ 22 |
| [pnpm](https://pnpm.io/) | 9.x |

**Install pnpm** (if you don't have it):

```bash
corepack enable
corepack install -g pnpm@9
```

---

## Quick start

```bash
# 1. Install all dependencies
pnpm install

# 2. Launch the desktop app in development mode
pnpm --filter @notes-app/desktop dev

# 3. (Optional) Run checks
pnpm typecheck   # TypeScript strict mode
pnpm lint        # ESLint
pnpm test        # Vitest unit tests
pnpm build       # Build all packages
```

### Self-hosted sync server (optional)

Instead of Syncthing you can run the bundled server and point the app at it
(**Settings → Sync → Server**):

```bash
docker build -t notes-sync-server ./server
docker run -d -e SYNC_TOKEN=your-secret -p 8080:8080 \
  -v /path/to/vault:/data notes-sync-server
```

### End-to-end tests

```bash
pnpm --filter @notes-app/desktop test:e2e   # Electron (Playwright)
pnpm --filter @notes-app/mobile-e2e test     # Android (Appium; needs an emulator + JDK 21+)
```

---

## Project structure

```
notes-app/
├── packages/           Shared TypeScript packages (used by all platforms)
│   ├── common/         Types, constants, frontmatter parser, wikilink utilities
│   ├── editor/         ProseMirror schema + plugins  (added in M1)
│   ├── vault/          File system abstraction, note indexer, file watcher  (M1)
│   ├── search/         Full-text search via Lunr.js  (M3)
│   ├── graph/          Graph data model for Cytoscape  (M4)
│   ├── sync/           Sync client + bidirectional SyncEngine  (M5/M7)
│   ├── import/         Anytype import (parser + relation/link mapping)  (M8)
│   └── ui/             All React components, shared across platforms  (M1)
├── apps/
│   ├── desktop/        Electron shell (main process, IPC, electron-builder)  (M1)
│   └── mobile/         Capacitor project + Kotlin plugins  (M6)
├── server/             Self-hosted sync server (Node.js + Express, OCI image)  (M7)
└── docs/               Architecture decisions (ADRs), user stories, roadmap
```

See [`docs/roadmap.md`](docs/roadmap.md) for the full build plan.
All milestones **M0–M8 are complete**: desktop + Android, Syncthing **and** self-hosted server
sync with conflict resolution, full-text search, graph view, and Anytype import.

---

## Where to go next

- **[`docs/features.md`](docs/features.md)** — end-user feature guide and full keyboard shortcut reference
- **[`docs/README.md`](docs/README.md)** — overview of all planning documents and how they fit together
- **[`docs/roadmap.md`](docs/roadmap.md)** — milestone-by-milestone build plan (M0–M8)
- **[`docs/adr/`](docs/adr/)** — one file per major technical decision, with context and rationale

---

## Contributing / running in development

This is a personal-use project. There is no contribution process.

To run the app: `pnpm --filter @notes-app/desktop dev` — opens an Electron window.
Select a folder containing Markdown files (or an empty folder) to start editing.

Notes are saved as plain `.md` files. No database, no lock-in.

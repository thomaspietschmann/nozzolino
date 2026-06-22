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

# 2. Check types (TypeScript strict mode)
pnpm typecheck

# 3. Check code style
pnpm lint

# 4. Run tests
pnpm test

# 5. Build all packages
pnpm build
```

All four commands should complete without errors on a fresh clone.

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
│   ├── sync/           Sync client  (M5/M7)
│   └── ui/             All React components, shared across platforms  (M1)
├── apps/
│   ├── desktop/        Electron shell (main process, IPC, electron-builder)  (M1)
│   └── android/        Capacitor project + Kotlin plugins  (M6)
├── server/             Self-hosted sync server (Node.js + Express, OCI image)  (M7)
└── docs/               Architecture decisions (ADRs), user stories, roadmap
```

Items marked with a milestone (e.g. `M1`) are planned but not yet built.
See [`docs/roadmap.md`](docs/roadmap.md) for the full build plan.

---

## Where to go next

- **[`docs/README.md`](docs/README.md)** — overview of all planning documents and how they fit together
- **[`docs/roadmap.md`](docs/roadmap.md)** — milestone-by-milestone build plan (M0–M8)
- **[`docs/adr/`](docs/adr/)** — one file per major technical decision, with context and rationale

---

## Contributing / running in development

This is a personal-use project. There is no contribution process.

The app is not yet runnable end-to-end — M0 (this milestone) sets up the monorepo
foundation and the `packages/common` utilities. The desktop app shell follows in M1.

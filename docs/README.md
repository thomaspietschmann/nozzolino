# Notes App — Documentation Index

This directory contains the authoritative planning documents for the notes app.
The three source files in the project root remain as-is for reference; this `docs/`
folder is the single place to go for decisions, stories, and build plan.

---

## Source Precedence Rule

When source documents conflict with each other, this rule applies:

| Priority | File | Role |
|---|---|---|
| 1 (highest) | `requirements.md` | Product truth — behaviour, UX, constraints |
| 2 | `technical-guidelines.md` | Technical truth — marked "Authoritative" |
| 3 (superseded) | `action-items.md` | Replaced by `docs/roadmap.md` |

See `source-reconciliation.md` for the four concrete conflicts that were found and resolved.

---

## Reading Order

1. **`source-reconciliation.md`** — four conflicts between the source files and how each is resolved. Read this first so you know which version of contested decisions is in effect.

2. **`roadmap.md`** — milestone-based build plan (M0–M8). Replaces the 13-phase `action-items.md`. Includes a cross-check table mapping every functional requirement to its milestone.

3. **`stories/user-stories.md`** — all user stories grouped by epic, with acceptance criteria and milestone assignments.

4. **`adr/`** — Architecture Decision Records. One per significant technical decision. Most formalise decisions already made in `technical-guidelines.md`; three (ADR-0006, ADR-0010, ADR-0011) resolve gaps that were unspecified in the source documents.

---

## ADR Index

| # | Title | Status |
|---|---|---|
| [0001](adr/0001-tech-stack.md) | Tech Stack (Electron, Capacitor, React, Zustand) | Accepted |
| [0002](adr/0002-monorepo-structure.md) | Monorepo Package Structure | Accepted |
| [0003](adr/0003-editor-prosemirror.md) | Editor Engine — ProseMirror | Accepted |
| [0004](adr/0004-file-format-frontmatter.md) | File Format & Frontmatter Schema | Accepted |
| [0005](adr/0005-attachment-storage.md) | Attachment Storage — Sibling Folder | Accepted |
| [0006](adr/0006-note-identity-uuid.md) | Note Identity — Lazy UUID Assignment | Accepted |
| [0007](adr/0007-search-lunr.md) | Full-Text Search — Lunr.js | Accepted |
| [0008](adr/0008-graph-cytoscape.md) | Graph View — Cytoscape.js + fcose | Accepted |
| [0009](adr/0009-sync-strategy.md) | Sync Strategy — Syncthing + Bundled Server | Accepted |
| [0010](adr/0010-external-edit-reconciliation.md) | External Edit Reconciliation | Accepted |
| [0011](adr/0011-wikilink-relationship-syntax.md) | Wikilink & Relationship Syntax | Accepted |

---

## MVP Boundary

Milestones M0–M6 constitute the MVP: fully functional desktop (Linux) + Android app,
synced via the user's existing Syncthing setup.

Milestones M7 (bundled sync server) and M8 (Anytype import) are post-MVP.
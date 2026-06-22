# ADR-0005: Attachment Storage — Sibling Folder

- **Date:** 2026-06-22
- **Status:** Accepted
- **Source:** `requirements.md` line 25 (explicit)
- **Resolves conflict:** See `source-reconciliation.md` — Conflict 1

---

## Context

When the user pastes an image (screenshot) into a note, that image must be stored on disk
so that the note file references it portably. Two approaches were considered:

1. **Sibling folder** next to the note file: `<note-stem>/image.png`
2. **Vault-level attachments directory**: `<vault>/.assets/image.png`

`action-items.md` Phase 3 item 10 specified approach 2 (`.assets/`).
`requirements.md` line 25 explicitly specifies approach 1 and explicitly prohibits
approach 2: "stored in a folder adjacent to the note file (a sibling folder, not a
vault-level attachments directory)".

---

## Decision

**Sibling folder.** For a note at `vault/projects/my-note.md`, attachments live at
`vault/projects/my-note/`.

Example:

```
vault/
├── projects/
│   ├── my-note.md
│   └── my-note/           ← attachment folder, created on first paste
│       ├── screenshot.png
│       └── diagram.png
└── journal/
    ├── 2026-06-22.md
    └── 2026-06-22/
        └── photo.jpg
```

The in-body reference in `my-note.md` is relative:

```markdown
![Screenshot](my-note/screenshot.png)
```

---

## Rationale

**Locality:** Attachments live next to their note. Moving or deleting a note and its
sibling folder together is a single filesystem operation. With a vault-level directory,
the user would have to manage orphaned attachment files separately.

**External editing:** When a user opens the vault in another editor or file manager,
they immediately see which folder belongs to which note. There is no hidden central store.

**Portability:** A zip export of a subfolder of the vault includes all relevant
attachments automatically. With a vault-level `.assets/` directory, a partial export
would need to walk all notes to determine which assets to include.

**Compliance with "files first" principle:** Each note is self-contained with its
folder. The vault has no global state beyond the note files themselves.

**Overrides `action-items.md`:**
The `.assets/` approach in Phase 3.10 was incorrect and directly contradicts the
requirements. Requirements win (see `source-reconciliation.md`).

---

## Consequences

- The attachment folder name is the note stem. If the note is renamed, the attachment
  folder must also be renamed, and the relative references in the note body must be updated.
  The rename propagation function (`replaceWikiLinkTarget` in `packages/common`) handles
  link rewriting; the `file:rename` IPC handler must also rename the sibling folder.
- The `VaultScanner` must treat `<note-stem>/` directories as attachment folders, not as
  subdirectories containing child notes. The convention: a directory whose name exactly
  matches the stem of a sibling `.md` file is an attachment folder, not a note folder.
- If the user creates a folder named identically to a note stem (rare, but possible in
  external editors), the indexer treats it as the attachment folder for that note.
  The user is responsible for avoiding this collision in external editors.
- The `chokidar` watcher watches the vault recursively and will emit events for files
  inside attachment folders. The indexer must ignore events for files at paths that are
  inside an attachment folder (i.e., inside a folder that is a sibling to a `.md` file
  with a matching name).

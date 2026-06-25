# Feature Guide

This guide covers everything the notes app can do, how to use it, and all keyboard shortcuts.

---

## Contents

1. [Getting started](#getting-started)
2. [Notes — CRUD](#notes--crud)
3. [Markdown editing](#markdown-editing)
4. [Wikilinks](#wikilinks)
5. [Command palette](#command-palette)
6. [Graph view](#graph-view)
7. [Tags & metadata](#tags--metadata)
8. [File tree & navigation](#file-tree--navigation)
9. [Month view](#month-view)
10. [Sync & conflicts](#sync--conflicts)
11. [Image paste](#image-paste)
12. [Themes & accent colour](#themes--accent-colour)
13. [Keyboard shortcut reference](#keyboard-shortcut-reference)
14. [Markdown autoformat reference](#markdown-autoformat-reference)

---

## Getting started

When you first open the app, you are prompted to pick a **vault folder** — a plain directory on disk where all your notes will live as `.md` files. Notes are never stored in a proprietary database; you can open them in any text editor at any time.

---

## Notes — CRUD

### Creating a note

Three ways:
1. Click the **`+`** button in the sidebar header.
2. Open the command palette (`Ctrl+K` / `⌘K`) and choose **New note** (or type a title and press Enter when "New note" is selected).
3. Type `[[My New Note]]` anywhere in an existing note and click the unresolved link — the app creates the note for you.

### Opening a note

Click it in the sidebar file tree, or open it via the command palette (`Ctrl+K`).

### Renaming a note

Click the note's title in the top header bar of the editor, edit it, and press **Enter** or click away. All `[[wikilinks]]` pointing to the old title are automatically rewritten.

### Deleting a note

Click the **⋯** menu in the note header and choose **Delete**.

---

## Markdown editing

The editor is a rich **Markdown editor powered by ProseMirror** — it renders Markdown visually while you type, and stores everything as standard `.md` files on disk.

### Formatting shortcuts

All shortcuts use **`Ctrl`** on Linux/Windows and **`⌘`** on macOS.

| Shortcut | Effect |
|---|---|
| `Ctrl/⌘+B` | Bold |
| `Ctrl/⌘+I` | Italic |
| `Ctrl/⌘+`` ` `` ` | Inline code |
| `Shift+Ctrl/⌘+S` | Strikethrough |
| `Ctrl/⌘+1` | Heading 1 |
| `Ctrl/⌘+2` | Heading 2 |
| `Ctrl/⌘+3` | Heading 3 |
| `Ctrl/⌘+0` | Paragraph (remove heading) |
| `Ctrl/⌘+>` | Blockquote |
| `Ctrl/⌘+Z` | Undo |
| `Shift+Ctrl/⌘+Z` | Redo |

### List shortcuts

| Shortcut | Effect |
|---|---|
| `Tab` | Indent list item |
| `Shift+Tab` | Outdent list item |
| `Enter` | New list item / split block |
| `Shift+Enter` | Exit code block |
| `Alt+↑` | Join with block above |
| `Alt+↓` | Join with block below |

### Markdown autoformat

Type these patterns at the **start of a line** (or inline) and they convert automatically:

| Pattern | Result |
|---|---|
| `# ` `## ` `### ` | Heading 1 / 2 / 3 |
| `> ` | Blockquote |
| `- ` or `* ` or `+ ` | Bullet list item |
| `1. ` | Ordered list item |
| ```` ``` ```` (+ optional language) | Code block |
| `---` | Horizontal rule |
| `**text**` or `__text__` | Bold |
| `*text*` or `_text_` | Italic |
| `` `text` `` | Inline code |
| `~~text~~` | Strikethrough |

---

## Wikilinks

Type `[[` anywhere in the editor to open the **wikilink autocomplete**. Start typing a note title to filter results; press `Enter` or click a result to insert the link.

- **Resolved link** (note exists) — hover over it to see a preview peek; **click it to open the linked note**.
- **Unresolved link** (note does not exist yet) — shown in amber. Click it to create the note immediately.

All wikilinks are stored as plain Markdown `[[Title]]` syntax, compatible with Obsidian, Logseq, and other tools.

### Backlinks

Open the **metadata panel** via the command palette (`Ctrl+K` → "Toggle metadata panel") to see a list of all notes that link *to* the current note ("Referenced by N notes").

---

## Command palette

Press **`Ctrl+K`** (`⌘K`) to open the command palette at any time.

- **Search** — type to full-text search across all notes. Results rank by relevance.
- **Filter by tag** — tap a tag chip below the search bar to narrow results to notes with that tag.
- **Navigate** — use `↑`/`↓` to move through results, `Enter` to open, `Esc` to close.
- **Actions** — at the bottom of the palette you'll find vault-wide actions:
  - **New note** — creates a note (uses the current search text as the title).
  - **Toggle metadata panel** — opens/closes the frontmatter & backlinks panel.
  - **Export vault to ZIP…** — exports all notes as a ZIP archive.
  - **Keyboard shortcuts** — opens the shortcut overlay.

---

## Graph view

Press **`Ctrl+G`** (`⌘G`) to toggle the **graph view** for the current note. The graph shows all notes and their wikilink relationships, with the active note highlighted.

- **Pan** — click and drag the canvas.
- **Zoom** — scroll wheel or pinch.
- **Click a node** — opens that note.

Press `Ctrl+G` again (or `Esc`) to return to the editor.

---

## Tags & metadata

Each note has an optional YAML frontmatter block with `id`, `created`, `modified`, `tags`, and optional `emoji` fields.

### Adding tags

1. Open the metadata panel: `Ctrl+K` → "Toggle metadata panel".
2. Type in the **"Add tag…"** input and press `Enter`.
3. To remove a tag, click **×** next to it.

Tags appear in the command palette as filter chips so you can narrow search results.

---

## File tree & navigation

The sidebar shows your notes in a **folder tree** — notes inside subfolders of your vault appear nested under their folder.

- Click a **folder name** to expand/collapse it.
- Click a **note** to open it.
- **Keyboard navigation** inside the tree: use `↑`/`↓` to move focus, `Enter` to open, `←`/`→` to collapse/expand folders.

---

## Month view

Click the **📅** button in the sidebar header to switch to the **month browser** — notes grouped by the month they were last modified.

Click **A–Z** to switch back to the folder tree.

---

## Sync & conflicts

The app supports two sync mechanisms (choose under **Settings → Sync**):

1. **Syncthing** (default) — point Syncthing (or any file-sync tool) at your vault folder. No app config required.
2. **Bundled server** — a self-hosted sync server you run yourself (see below).

### Sync modes (Settings → Sync)

Open the sidebar **⚙ Settings** panel → **Sync** and pick a mode:

- **Syncthing** — the app only watches files and resolves conflicts; transport is handled externally.
- **Server** — enter the server **URL** and **token**, then **Test** the connection. The app polls the
  server (~60s on desktop, ~120s on mobile foreground), pushing local changes and pulling remote ones.
  When both sides changed the same note, it falls back to the same conflict-resolution flow as Syncthing.
- **None** — no sync.

### Running the bundled sync server

The server is a small self-hosted container (single user). Run it on a home server or VPS:

```bash
docker run -d \
  -e SYNC_TOKEN=your-secret-token \
  -p 8080:8080 \
  -v /path/to/your/vault:/data \
  ghcr.io/<owner>/notes-app-server:latest
```

Put HTTPS in front of it with a reverse proxy (Caddy/nginx). Then in the app set **Sync → Server**,
URL = your server URL, token = `SYNC_TOKEN`.

### Sync status dot

The coloured dot at the top of the sidebar shows sync status:

| Colour | Meaning |
|---|---|
| 🟢 Green | Synced |
| 🟡 Yellow | Syncing |
| 🔴 Red (solid) | Conflict detected |
| 🔴 Red (ring) | Offline |

### Conflicts

When the same note is edited on two devices between syncs, a conflict file (`.sync-conflict-…`) appears in the vault. The app detects this and shows a **conflict banner** above the editor. Click **"Review versions"** to open the diff view, pick the content you want to keep, and click **"Resolve"**.

**On a single device** — the app never creates false conflicts. Your own autosave writes are tracked internally and never trigger the conflict flow.

---

## Import from Anytype

Migrate an existing Anytype vault. Export your Anytype space as **Markdown** (a `.zip`), then in the app:

1. Open **⚙ Settings → "↑ Import from Anytype…"**.
2. Choose the exported `.zip`. A **preview** shows how many notes, tags and links will be imported.
3. Click **Import** to write the notes into your vault.

The importer maps Anytype **relations → tags** and **internal links → `[[wikilinks]]`**. Attachments are
counted in the preview but not copied in this version. Import currently runs on desktop.

---

## Image paste

Paste an image (from clipboard) directly into the editor. The app saves it as a file in a sibling folder named after the note and inserts a Markdown `![](path/to/image.png)` link.

---

## Themes & accent colour

Click the **⚙** button in the sidebar header to open settings.

- **Theme** — switch between **Dark** (default) and **Light** mode.
- **Accent colour** — pick one of several accent colours. The accent is used for links, active states, and the progress ring.

---

## Keyboard shortcut reference

Full reference. Modifier key: **`Ctrl`** on Linux/Windows, **`⌘`** on macOS.

### Global

| Shortcut | Action |
|---|---|
| `Ctrl/⌘+K` | Open command palette / search |
| `Ctrl/⌘+G` | Toggle graph view |
| `⌨` button | Open keyboard shortcut overlay |
| `Esc` | Close overlay / deselect |

### Editor — Formatting

| Shortcut | Action |
|---|---|
| `Ctrl/⌘+B` | Bold |
| `Ctrl/⌘+I` | Italic |
| `Ctrl/⌘+`` ` `` ` | Inline code |
| `Shift+Ctrl/⌘+S` | Strikethrough |
| `Ctrl/⌘+1` | Heading 1 |
| `Ctrl/⌘+2` | Heading 2 |
| `Ctrl/⌘+3` | Heading 3 |
| `Ctrl/⌘+0` | Paragraph (remove heading) |
| `Ctrl/⌘+>` | Blockquote |
| `Ctrl/⌘+Z` | Undo |
| `Shift+Ctrl/⌘+Z` | Redo |

### Editor — Lists & Blocks

| Shortcut | Action |
|---|---|
| `Tab` | Indent list item |
| `Shift+Tab` | Outdent list item |
| `Enter` | New list item / split block |
| `Shift+Enter` | Exit code block |
| `Alt+↑` | Join with block above |
| `Alt+↓` | Join with block below |

---

## Markdown autoformat reference

Type these triggers at the start of a line (or inline) and the editor converts them automatically.

| Trigger | Result |
|---|---|
| `# ` | Heading 1 |
| `## ` | Heading 2 |
| `### ` | Heading 3 |
| `> ` | Blockquote |
| `- ` or `* ` or `+ ` | Bullet list item |
| `1. ` | Ordered list item |
| ```` ``` ```` | Code block (add language after, e.g. ```` ```js ````) |
| `---` | Horizontal rule |
| `**text**` or `__text__` | Bold |
| `*text*` or `_text_` | Italic |
| `` `text` `` | Inline code |
| `~~text~~` | Strikethrough |

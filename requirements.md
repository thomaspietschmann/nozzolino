# Notes App — Requirements & Constraints

## Overview

A self-hosted, cross-platform note-taking application for personal use. Inspired by Anytype (UX reference) and Obsidian, but with open licensing, plain-file storage, and no dependency on proprietary sync infrastructure.

---

## Platforms

- **Linux desktop** (primary writing environment)
- **Android mobile** (read, write, search — close to desktop parity)
- Tech stack must feel **snappy and well-integrated with the OS**; webview-based rendering is acceptable if it meets that bar
- Forbidden runtimes: **Go, PHP**, and anything genuinely legacy (COBOL, Fortran, etc.)
- Acceptable runtimes: Rust, Node.js, Python, JVM-based languages, and similar modern ecosystems

---

## Storage & File Format

- Notes stored as **plain Markdown files** on disk
- **Nested folder structure** supported
- Files must remain **directly editable outside the app** (any text editor, terminal, etc.)
- Files must be **greppable without opening the app** (no proprietary database as primary store)
- Images pasted directly into notes are **embedded**: stored in a **folder adjacent to the note file** (a sibling folder, not a vault-level attachments directory)
- Larger files (PDFs, etc.) are **linked, not embedded**
- **Note title = filename**: no separate title index; links use the filename to resolve references
- **Rename propagation**: when a note is renamed, all `[[links]]` referencing the old filename are automatically updated vault-wide
- Tags stored in **YAML frontmatter** (primary source of truth); secondary indexing strategy is an implementation decision

---

## Sync

- **No proprietary sync service**
- Two supported sync modes:
  1. **Syncthing** — user already has an existing Syncthing setup running between devices; app must coexist cleanly with it
  2. **Bundled self-hosted sync server** — must ship as an **OCI image or a single binary** for drop-in deployment
- User already has both a WireGuard-accessible home server and a VPS available
- Authentication: **token-based**
- Single-user only — no multi-user accounts or shared notes

### Offline & Conflict Handling

- **Full offline support** — app works without network, syncs when connectivity returns
- **Background sync on mobile** — transparent, no user interaction; app is up-to-date the moment it is opened
- On Android, a **persistent foreground service** (with a status bar notification) is acceptable to achieve reliable background sync
- **Auto-refresh on all platforms** — app automatically shows the latest version when files change, no manual reload
- Conflict resolution: user is presented with the two conflicting versions and **manually edits a merged result**, then **explicitly marks the note as resolved**
- No cross-device version history required — latest version is sufficient

---

## Editor

- **WYSIWYG editor**: formatting renders as you type; raw Markdown is **hidden by default**
- Raw syntax may be **briefly revealed at the cursor position only** (Typora/ProseMirror style) — this is acceptable
- Standard Markdown features: headings, lists, bold/italic, code blocks, tables, etc.
- **Syntax highlighting** in code blocks is required; supported languages at minimum: `bash`, `java`, `rust`, `ruby`, `javascript`, `typescript`, `kotlin`
- **Table editing**: fully visual — drag-and-drop to reorder rows/columns, UI controls to add/remove rows and columns; no raw Markdown table syntax editing required
- **Direct image paste** into notes (screenshots) → stored in note-adjacent attachment folder
- **Link to external files** (PDFs, etc.) — not embedded
- **Quick-peek**: temporary read-only overlay showing a referenced note without navigating away; no editing from within the overlay
- Widgets: **descoped for now**, to be revisited in a later iteration

---

## Search

- **Full-text search** on note **body content only** (YAML frontmatter excluded from full-text index)
- **Tags** are separately searchable and filterable — not included in full-text results, but always available as a distinct filter
- Search is **case-insensitive**, **exact substring** matching — no fuzzy/approximate matching
- Search results show the **note title** plus a **snippet of surrounding context** from the matching body text
- Results appear **debounced (~300ms)** in a modal overlay, dismiss on selection
- Files remain grep-friendly on disk for external search

---

## Tags

- **Flat tag system** (no hierarchical tags)
- Stored in **YAML frontmatter**
- Soft cap of **~10 tags per note** (average expected: 4)
- Tag filtering works **across all folders** (vault-wide)

---

## Relationships & Graph View

- Named relationships stored **within the Markdown files** using extended wikilink syntax:
  ```
  [[Note Title||RELATIONSHIP_TYPE]]
  ```
- **Relationship types are user-defined on the fly**: the user can type any new relationship type inline; autocomplete surfaces previously used types
- The editor must make this hard to get wrong:
  - Autocomplete for both existing note names and previously used relationship types
  - Validation warning if linking to a note that does not exist — warning UI **offers to create the missing note immediately**
- **Graph view**: displays all notes as nodes with named, directional edges
- Each note can have an optional **emoji** assigned; that emoji is displayed as the node label in the graph view
- Graph is **filterable and searchable by relationship type**
- Clicking a node in the graph shows both **outgoing relationships** (links defined in this note) and **incoming back-references** (other notes linking to this one)
- Relationships sync across devices as part of the file

---

## Scale

- Expected: **hundreds of notes** — will not reach 1,000
- No special performance constraints beyond snappy search and graph rendering at this scale

---

## Import / Export

- **Import from Anytype** (prior tool — user has existing data there)
  > **TBD**: volume of notes/attachments and mapping of Anytype-specific object types not yet specified
- **Export full vault to zip** (all markdown files, attachments, folder structure)

---

## Mobile UX

- Use cases: **reading, writing, searching**
- Must feel **lightweight and snappy**
- **Close to desktop parity** in features
  > **TBD**: specific features acceptable to deprioritise on mobile if they add significant complexity not yet agreed
- **Background sync** via persistent foreground service — notes are always fresh when app is opened
- **Cold-start performance**: target use cases and acceptable cold-start time
  > **TBD**: user's typical Android launch workflow not yet specified

---

## Out of Scope (for now)

- Version history / time-travel ("what did this note say last Tuesday")
- Multi-user collaboration or shared notes
- Hierarchical tags
- Embedded widget system (OSM map, etc.) — to be revisited
- Full hex color picker for accent (replaced by predefined color presets)

---

## Key Design Principles

1. **Files first** — the source of truth is always plain files on disk, never a hidden database
2. **Zero sync anxiety** — the user should never wonder if their devices are in sync
3. **Works offline** — full functionality without a network connection
4. **Editable anywhere** — notes can be opened and edited in any text editor, not just this app
5. **Open and self-hosted** — no proprietary services, no licensing lock-in (primary reason Anytype was abandoned)

---

## UX Specifications

### Editor

- **WYSIWYG with cursor-position reveal**: formatting is always rendered; raw Markdown syntax is only briefly visible at the cursor (Typora style)
- **New note flow**: title field focused immediately, blank editor body below, cursor ready — identical on desktop and mobile. No template picker.
- **Dense information layout**: more text on screen (Obsidian-style density), not generous whitespace (no Bear/Notion-style padding)
- **Quick-peek**: long-press or hover on `[[link]]` opens a read-only overlay of the target note; no navigation occurs; overlay dismisses on click-away

### Navigation & Sidebar

- **Sidebar**: hidden by default while writing; slides in on demand. Same behaviour on mobile.
- **Primary navigation model**: tag + title search; time-based (month) browsing. Folder hierarchy is secondary.
- **Command palette** (`Ctrl+K` or equivalent):
  - Searches note titles
  - Searches tags (shows notes with that tag)
  - Surfaces actions (new note, export, etc.)
- **Search results**: debounced (~300ms), appear in a **modal overlay**, dismiss on selection, include body snippet

### Graph View

- **Interaction**: pan, zoom, click node to open note
- **Node display**: each node shows the note's assigned emoji (if set); falls back to a default shape if no emoji assigned
- **Default focus**: opens on **current note + 1 level of neighbours** (not full vault)
- User can freely expand depth interactively; full-vault view is also available as a mode
- **Layout**: force-directed (rearranges on each open — acceptable)
- **Usage pattern**: daily navigation tool AND relationship discovery — must be fast and always-accessible
- **Required on mobile**: full graph on mobile (user uses phone as primary device sometimes)
- Mobile: **pinch to zoom** supported

### Relationships

- **Primary creation method**: type `[[Note Title||TYPE]]` inline — autocomplete fires for both note name and relationship type
- **Secondary**: command palette action
- **Tertiary**: toolbar button
- **Example relationship types**: `client of`, `hosts`, `references`

### Sync Status Indicator

- **Persistent subtle dot** on every screen — never obtrusive, always findable
- **Four states**:
  - **Solid green**: fully synced
  - **Solid yellow**: sync in progress
  - **Solid red**: error (server unreachable, file permission error, etc.) — tap for details
  - **Hollow red circle**: no network connection

### Conflict Resolution UI

- **Non-blocking banner** at top of conflicted note: *"This note has a conflict — tap to review versions side by side"*
- Opens a side-by-side diff view
- User manually edits to produce a merged result, then taps **"Mark as resolved"**
- No modal blocking access to other notes during this flow

### Mobile Gestures

- Swipe from **edge** → open sidebar
- **Long press** on `[[link]]` → quick-peek (read-only, no navigation)
- **Pinch to zoom** → graph view depth
- **Pull down** → force sync

### Visual Design

- **Dark mode** (primary)
- **Accent color**: magenta/purple default; user-selectable from a **small set of predefined color presets** (no free hex picker)
- No high-contrast mode required (for now)
- Light mode not required (but theming system should not preclude it)

### Onboarding

- When opening on a **fresh vault** (no notes): empty state with a **single subtle hint** toward creating the first note — no guided walkthrough, no tutorial notes, no mandatory steps
- When opening on an **existing vault directory**: app **prompts to confirm** before indexing the contents — no silent auto-import

### Keyboard & Accessibility

- No specific shortcut conflicts or custom bindings required at this stage — standard conventions are fine
- No accessibility requirements identified (no screen reader, motor, or WCAG compliance needed now)

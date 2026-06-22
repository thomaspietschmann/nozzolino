# User Stories

Stories are grouped by epic. Each story has an ID, a milestone assignment, and acceptance
criteria. All acceptance criteria are written as observable, testable behaviours.

**Persona:** The single user — a developer/knowledge worker using Linux desktop and Android.

**Milestone column (M):** The milestone in which this story is delivered. See `docs/roadmap.md`.

---

## Epic A — Vault & Navigation

### A1 — Open a vault directory
**M1** | As the user, I want to open a folder on my filesystem as my vault so that the app
loads all my notes from that location.

Acceptance criteria:
- A folder picker dialog opens when I click "Open vault"
- After selecting a folder, the app displays the folder contents in the sidebar file tree
- The last opened vault path is persisted and pre-selected on next app launch
- Recent vaults (up to 5) are listed on the start screen for quick access

### A2 — Create a new vault
**M1** | As the user, I want to create a new empty vault in a chosen folder so that I can
start fresh without existing notes.

Acceptance criteria:
- I can pick any empty folder (or create a new one via the dialog) as a new vault
- On open, the app shows an empty-state hint ("create your first note") — no guided tour,
  no template notes, no mandatory steps
- No files are created in the folder until I explicitly create the first note

### A3 — Confirm before indexing an existing vault
**M1** | As the user, I want the app to ask for confirmation before scanning an existing
folder full of notes so that I'm not surprised by the app silently reading all my files.

Acceptance criteria:
- When I open a non-empty folder, a confirmation dialog appears: "Index X Markdown files in this folder?"
- I can cancel without any files being read
- After confirming, the indexing proceeds and the sidebar populates
- The confirmation is shown only once per vault path (persisted in app settings)

### A4 — Navigate the file tree
**M1** | As the user, I want to browse my notes in a hierarchical folder tree in the sidebar
so that I can navigate to any note by its location.

Acceptance criteria:
- Folders expand and collapse on click
- Folders remember their expanded/collapsed state across sessions
- Files show only the note title (filename stem, not the `.md` extension)
- Clicking a file opens the note in the editor
- The currently open note is highlighted in the sidebar using the accent colour
- Arrow keys move focus through the tree; Enter opens a note; right/left expand/collapse folders

### A5 — Sidebar hidden while writing
**M1** | As the user, I want the sidebar to be hidden by default when I'm writing so that
I have a distraction-free editing experience.

Acceptance criteria:
- The sidebar is hidden (collapsed, not visible) when a note is open in the editor
- A button or keyboard shortcut (`Ctrl+\` or equivalent) toggles the sidebar
- On mobile, the sidebar slides in from the left edge (see G3)
- The sidebar toggle state does not persist — it always starts hidden when a note is opened

### A6 — Command palette
**M3** | As the user, I want a command palette triggered by `Ctrl+K` so that I can
navigate to any note, filter by tag, or run an app action without using the mouse.

Acceptance criteria:
- `Ctrl+K` opens the command palette modal from anywhere in the app
- The input field is focused immediately on open
- Typing searches note titles (prefix/substring match, case-insensitive)
- Typing `#tagname` filters to notes with that tag
- The palette surfaces app actions: "New note", "Export vault", "Settings", "Open graph"
- Results appear within 300ms of the last keystroke (debounced)
- Arrow keys navigate results; Enter selects; Escape closes
- Selecting a note closes the palette and opens the note in the editor

### A7 — Month-based note browsing
**M3** | As the user, I want to browse notes grouped by the month they were last modified
so that I can find notes by approximate time without remembering their title.

Acceptance criteria:
- The sidebar has a "By date" section that groups notes by `modified` month/year
- Groups are sorted newest-first
- Clicking a note title opens it in the editor
- This view is in addition to, not replacing, the folder tree

---

## Epic B — Editing

### B1 — WYSIWYG editor with cursor-reveal
**M1** | As the user, I want to write notes in a WYSIWYG editor where Markdown syntax is
hidden unless my cursor is on it (Typora style) so that I'm reading a rendered document
at all times.

Acceptance criteria:
- Formatted text renders immediately: `**bold**` shows as **bold** (not as raw asterisks)
- When the cursor moves into a formatted region (bold, heading, link, wiki-link), the
  raw Markdown syntax becomes visible around the cursor position only
- When the cursor moves away, the syntax collapses back to rendered form
- Switching between notes is instant (no full re-render flash)

### B2 — New note flow
**M1** | As the user, I want to create a new note with the title field focused immediately
so that I can start naming and writing without any extra steps.

Acceptance criteria:
- "New note" (from sidebar context menu, command palette, or `Ctrl+N`) opens a blank editor
- The title field is focused and empty
- The editor body is below the title, ready to receive input after I press Tab or Enter
- No template picker, no dialog — directly in the editor
- The note file is created on disk only when I type the first character in the title field
  (to avoid creating empty untitled files)

### B3 — Standard Markdown editing
**M1** | As the user, I want all standard Markdown formatting to work in the editor so that
I can write richly structured notes.

Acceptance criteria:
- Headings (H1–H6) via `# ` prefix input rule
- Bold via `**text**` input rule; Italic via `*text*`
- Inline code via `` `code` ``
- Bullet lists via `- ` prefix; Ordered lists via `1. ` prefix
- Blockquotes via `> ` prefix
- Horizontal rule via `---` on a blank line
- All formatting is WYSIWYG (see B1); the underlying file is valid Markdown

### B4 — Syntax highlighting in code blocks
**M1** | As the user, I want code blocks to have syntax highlighting for the languages I use
so that code is readable in my notes.

Acceptance criteria:
- A fenced code block with a language tag (e.g., ` ```rust`) shows syntax-highlighted code
- Supported languages: `bash`, `java`, `rust`, `ruby`, `javascript`, `typescript`, `kotlin`
- Code blocks with no language tag or an unsupported language render as plain monospace text
  (no error shown)
- Highlighting is applied via decorations; the underlying Markdown file contains only the raw code

### B5 — Visual table editor
**M1** | As the user, I want to edit tables visually without typing raw Markdown table syntax
so that I can restructure tables quickly.

Acceptance criteria:
- Typing `|` on a new line and pressing Tab creates a table
- Tab and Shift-Tab navigate between cells
- A toolbar appears when the cursor is inside a table: "Add row above/below", "Add column left/right", "Delete row", "Delete column"
- Rows can be reordered by dragging a row handle on the left
- Columns can be reordered by dragging a column handle at the top
- The table is serialised as standard Markdown table syntax in the `.md` file

### B6 — Image paste into note
**M1** | As the user, I want to paste a screenshot directly into a note so that the image
is saved and referenced in the note automatically.

Acceptance criteria:
- Pasting an image from the clipboard (e.g., a screenshot) inserts it into the note body
- The image file is written to the note-adjacent sibling folder: `<note-stem>/<timestamp>.png`
  (see [ADR-0005](../adr/0005-attachment-storage.md))
- The note body contains a relative reference: `![](my-note/timestamp.png)`
- The image renders inline in the editor
- Pasting while the note has no title yet creates the attachment folder using a temporary name
  (finalised when the note title is set)

### B7 — Link to external files
**M1** | As the user, I want to link to external files (PDFs, etc.) in a note so that I can
reference them without embedding them.

Acceptance criteria:
- I can drag-drop a file (e.g. a PDF) onto the editor to insert a standard Markdown link
- The link uses a relative path from the note file to the target file
- The app does not copy the file; it only creates a reference
- The link is rendered as a clickable element in the editor; clicking it opens the file
  in the OS default application (via Electron `shell.openPath`)

### B8 — Auto-save with atomic write
**M1** | As the user, I want my note to be saved automatically without me pressing Ctrl+S
so that I never lose work.

Acceptance criteria:
- Changes are saved to disk 1 second after the last keystroke (debounced)
- A subtle "saving…" indicator appears in the note header during the save; it disappears
  on success
- Saves use atomic write (`<path>.tmp` → rename) so partial files never appear on disk
- If the app is closed with unsaved changes (within the 1s window), a confirmation dialog
  appears ("Save before closing?")
- The `.md` file saved to disk is valid, readable Markdown

### B9 — Frontmatter panel
**M1** | As the user, I want a side panel showing the note's metadata (tags, emoji, dates)
so that I can view and edit frontmatter without touching the raw YAML.

Acceptance criteria:
- A toggleable panel (or persistent area) shows: tags, emoji, uuid (read-only), created (read-only), modified (read-only)
- Tags: typeahead input from the vault-wide tag list; I can add and remove tags; stored as YAML list
- Emoji: a small picker or freeform text input; stored in frontmatter `emoji` field
- Modifying tags or emoji triggers auto-save (same 1s debounce)
- The panel does not require navigating away from the editor

### B10 — Dense information layout
**M1** | As the user, I want the editor to display more text on screen at once (Obsidian-style
density) so that I can read and write without excessive scrolling.

Acceptance criteria:
- Default line height and padding are compact — not generous Bear/Notion-style whitespace
- Body font size is readable but not large
- More than 20 lines of text are visible on a standard 1080p display without scrolling
- The layout is consistent on both desktop and Android

---

## Epic C — Linking & Relationships

### C1 — Create wiki-links
**M2** | As the user, I want to type `[[` and get an autocomplete dropdown of note titles
so that I can link to any note without leaving the editor.

Acceptance criteria:
- Typing `[[` anywhere in the note body opens a floating autocomplete list
- The list is populated from all note titles in the vault (case-insensitive prefix match)
- Arrow keys navigate the list; Enter inserts the selected wiki-link node
- The inserted link renders as a styled span (not raw `[[...]]` text) per the WYSIWYG principle
- Pressing Escape closes the autocomplete without inserting anything

### C2 — Relationship type syntax
**M2** | As the user, I want to type `[[Title||TYPE]]` to express a named relationship between
notes so that the graph view can show the relationship type on the edge.

Acceptance criteria:
- After typing `||` inside a `[[...]]` context, a second autocomplete opens with previously used relationship types
- I can type a new relationship type that has never been used before; pressing Enter adds it
- The relationship type is stored in the `wiki_link` node's `rel_type` attribute
- The serialised form in the `.md` file is `[[Note Title||TYPE]]`
- The relationship type is visible in the graph edge label (M4)

### C3 — Validation and "create missing note"
**M2** | As the user, I want the editor to warn me when I link to a note that doesn't exist
and offer to create it so that I don't end up with broken links.

Acceptance criteria:
- On editor blur, all wiki-link nodes are validated against the `VaultIndex` title list
- Links to non-existent notes are decorated with a visual warning (e.g., dashed underline or different colour)
- A tooltip or inline affordance on the warning says "Note not found — create it?"
- Clicking "create it?" opens a new note pre-filled with the linked title
- After the note is created, the link decoration clears on the next validation pass

### C4 — Quick-peek overlay
**M2** | As the user, I want to hover over a `[[link]]` to see a read-only preview of the
target note so that I can recall its content without navigating away.

Acceptance criteria:
- Hovering a wiki-link on desktop (or long-pressing on mobile — see G4) opens a floating read-only panel
- The panel shows the target note's full body content, rendered (not raw Markdown)
- I cannot edit the note from within the quick-peek panel
- Clicking anywhere outside the panel or pressing Escape closes it
- Navigation does not occur — the main editor stays on the current note

### C5 — Rename note with link propagation
**M2** | As the user, I want to rename a note and have all `[[links]]` pointing to it
updated automatically so that no links break after a rename.

Acceptance criteria:
- Clicking the note title in the header makes it an editable field
- On commit (Enter or blur), if the title changed: the file is renamed on disk; all vault files
  containing `[[OldTitle]]` or `[[OldTitle||TYPE]]` are rewritten to use the new title
- The sidebar reflects the new filename immediately
- The rename is shown as a single undo-able action (or at least the user is informed that
  N other notes were updated)
- Renaming is fast (<500ms) even if many notes reference the renamed note

### C6 — Back-references
**M2** | As the user, I want to see which notes link to the current note so that I can
understand its context in the knowledge graph.

Acceptance criteria:
- The frontmatter panel (B9) shows a "Referenced by" section listing notes that contain
  `[[CurrentNoteTitle]]`
- The list updates in real time when the vault index changes (e.g., after another note is saved)
- Clicking a back-reference opens that note in the editor

---

## Epic D — Search & Tags

### D1 — Full-text body search
**M3** | As the user, I want to search across all my notes' body content so that I can find
any note by a word or phrase it contains.

Acceptance criteria:
- Search covers body text only — YAML frontmatter is not included in results
- Search is case-insensitive
- Search is exact substring (prefix match per token): searching `arch` finds notes containing `architecture`
- No fuzzy/approximate matching — only exact prefix hits

### D2 — Search results with snippets
**M3** | As the user, I want search results to show the note title plus a snippet of surrounding
context so that I can tell which note is the right one without opening it.

Acceptance criteria:
- Each result shows: note title, parent folder path, 150-character snippet of body text
  surrounding the first match
- The matching term(s) are highlighted with a `<mark>` element inside the snippet
- Results are ordered by Lunr relevance score

### D3 — Debounced search modal
**M3** | As the user, I want search results to appear automatically 300ms after I stop
typing, in a modal overlay, so that the search is instant and unobtrusive.

Acceptance criteria:
- Search fires 300ms after the last keystroke (not on every keystroke)
- Results appear in a modal overlay (not a separate page)
- The modal dismisses when I select a result or press Escape
- After selection, the editor navigates to the note and scrolls to the first match

### D4 — Tag-based filter
**M3** | As the user, I want to filter notes by one or more tags so that I can find all notes
on a topic regardless of which folder they're in.

Acceptance criteria:
- The search modal / command palette shows a tag filter above or below the text input
- I can select multiple tags; the filter uses AND logic (note must have all selected tags)
- Selecting tags with no text query returns all notes that have all the selected tags
- Tag filter and text search combine: results must match both the text query and the tag filter
- The tag list is sorted by frequency (most-used tags first)

### D5 — Flat tag system
**M1** | As the user, I want a flat tag system with no hierarchy so that I can add tags
quickly without managing a taxonomy.

Acceptance criteria:
- Tags have no parent/child relationship — there are no "subtags"
- Tags are stored in YAML frontmatter as a plain list: `tags: [design, api, backend]`
- The tag input in the frontmatter panel (B9) shows all existing vault tags as typeahead suggestions
- New tags are created by typing; no confirmation step required

---

## Epic E — Graph View

### E1 — Graph view with nodes and edges
**M4** | As the user, I want to see a visual graph of all my notes with named directional
edges so that I can understand the relationships between notes at a glance.

Acceptance criteria:
- Each note is a node; each `[[Title||TYPE]]` link is a directed edge
- Plain `[[Title]]` links (no type) appear as edges with no label
- The graph uses a force-directed layout (fcose)
- The graph is accessible from a persistent "Graph" button/icon in the app shell

### E2 — Emoji node labels
**M4** | As the user, I want each node in the graph to show the note's emoji so that I can
identify notes visually in the graph.

Acceptance criteria:
- Nodes show the note's `emoji` frontmatter value as the label
- If a note has no emoji, the node shows the first letter of the note title
- Font size scales with zoom level (readable at all zoom levels)
- The focal node (currently open note) uses the accent colour; others use a muted colour

### E3 — Depth-1 default with expandable depth
**M4** | As the user, I want the graph to open showing only the current note and its direct
neighbours so that I'm not overwhelmed by the full vault graph.

Acceptance criteria:
- Opening the graph shows the current note as the focal node plus all notes one hop away
  (both outgoing links and incoming back-references)
- A "Show full graph" button switches to displaying all notes in the vault
- Clicking a neighbour node expands the graph to show that node's neighbours (adds one hop)
- Expanding is additive — already-displayed nodes remain visible

### E4 — Filter by relationship type
**M4** | As the user, I want to filter the graph by relationship type so that I can focus
on a specific kind of relationship (e.g., "client of").

Acceptance criteria:
- A multi-select dropdown above the graph lists all distinct relationship types in the vault
- Deselecting a type hides edges of that type and their isolated nodes (nodes with no remaining edges are hidden)
- Reselecting re-adds those edges and nodes
- Filter changes re-run the layout on the visible subset

### E5 — Navigate from graph
**M4** | As the user, I want to click a node in the graph to open that note so that the graph
is a navigation tool, not just a visualisation.

Acceptance criteria:
- Clicking a node opens the corresponding note in the editor
- The graph updates its focal node to the newly opened note (depth-1 centred on it)
- The back button in the editor (or breadcrumb) returns to the previous note

### E6 — Pan, zoom, and on-screen controls
**M4** | As the user, I want to pan and zoom the graph freely so that I can explore it at
any scale.

Acceptance criteria:
- Mouse wheel zooms in/out; click-and-drag pans (desktop)
- On-screen +/- buttons and a reset button are available for keyboard/touch users
- Zoom level is bounded (min zoom shows all nodes legibly; max zoom shows emoji at large size)
- Pinch-to-zoom works on Android (see G5)

### E7 — Hover tooltip
**M4** | As the user, I want to hover over a graph node to see the note's full title and
back-reference count so that I can identify nodes without clicking.

Acceptance criteria:
- Hovering a node shows a tooltip with: full note title, number of incoming back-references
- Tooltip appears after a short delay (200ms) to avoid flickering during pan
- Tooltip disappears when the cursor leaves the node or when panning begins

---

## Epic F — Sync & Conflicts

### F1 — Syncthing coexistence
**M5** | As the user, I want the app to coexist cleanly with my existing Syncthing setup
so that Syncthing can sync my vault without interference from the app.

Acceptance criteria:
- All file writes use atomic write (write-to-`.tmp` then rename) — no partial files visible to Syncthing
- The app holds no exclusive file locks — Syncthing can read/write at any time
- The app does not start, stop, or configure Syncthing — these are entirely the user's responsibility
- The `.tmp` temp files are cleaned up within 1 second of a save (they only exist during the rename)

### F2 — 4-state sync status dot
**M5** | As the user, I want a persistent sync status indicator on every screen so that I
always know the sync state without having to look for it.

Acceptance criteria:
- A small dot is always visible in the app title bar / status area
- Four states: solid green (synced), solid yellow (sync in progress), solid red (conflict or error), hollow red circle (no network)
- Tapping the dot when it's red shows a details panel: error message or list of unresolved conflicts
- The dot is subtle — it does not interrupt reading or writing

### F3 — Non-blocking conflict banner
**M5** | As the user, I want to be notified of a conflict in a note without being interrupted
so that I can finish my current thought and resolve the conflict when I'm ready.

Acceptance criteria:
- When a note has a Syncthing conflict file (or an externally-created conflict per [ADR-0010](../adr/0010-external-edit-reconciliation.md)), a banner appears at the top of the note editor
- The banner reads "This note has a conflict — tap to review versions side by side"
- The banner is non-blocking: I can continue editing, scroll, or navigate away
- The banner persists until the conflict is resolved
- The sync dot turns solid red while any conflict is unresolved

### F4 — Side-by-side conflict resolution
**M5** | As the user, I want to see both conflicting versions of a note side by side so that
I can decide how to merge them.

Acceptance criteria:
- Tapping the conflict banner opens a full-screen (or large modal) side-by-side view
- Left pane: the current file content (read-only diff view)
- Right pane: the conflict file content (read-only diff view)
- Changed lines are highlighted (line-level diff)
- A "Use this version" button on each pane allows choosing one version entirely without manual editing
- A writable merge editor below is pre-populated with the current version for manual editing

### F5 — Manual merge and "Mark as resolved"
**M5** | As the user, I want to manually edit a merged result and explicitly mark the note
as resolved so that I control the final content.

Acceptance criteria:
- The writable merge editor (below the side-by-side diff) accepts any changes
- "Mark as resolved" saves the merge editor content to the primary note file
- The conflict file is deleted
- The conflict is removed from `conflictsSlice`
- The sync dot returns to green (if no other conflicts)
- The conflict banner in the editor disappears

### F6 — Full offline support
**M5** | As the user, I want to use the app fully without a network connection so that
my notes are always accessible.

Acceptance criteria:
- All read and write operations work with no network (vault is on local disk)
- The sync dot shows hollow red (no network) but the app is fully functional
- When network returns, Syncthing (or the server client in M7) resumes automatically
- The app does not show loading spinners or disabled states due to lack of network

### F7 — Auto-refresh on external file change
**M5** | As the user, I want the app to automatically show the latest version of a note
when the file changes externally so that I'm always reading the current content.

Acceptance criteria:
- When Syncthing delivers an updated file, the sidebar and (if open) the editor reflect the new content within 2 seconds on desktop (immediate on `chokidar` event)
- On Android, the mtime poller detects the change within 30 seconds and refreshes
- If the note is open in the editor with no unsaved changes: the editor silently reloads
- If the note is open with unsaved changes: see [ADR-0010](../adr/0010-external-edit-reconciliation.md) (conflict flow)

---

## Epic G — Mobile (Android)

### G1 — Full app on Android
**M6** | As the user, I want to use the same features on my Android phone as on my Linux
desktop so that my phone is a fully capable note-taking device.

Acceptance criteria:
- All M1–M5 features work on Android (create, edit, link, search, graph, sync)
- The Capacitor shell wraps the same React app as desktop — no separate mobile codebase
- Notes are stored in the Capacitor app-scoped external storage directory

### G2 — Background sync via foreground service
**M6** | As the user, I want my notes to be up-to-date when I open the app so that I
never have to wait for a sync to complete before reading.

Acceptance criteria:
- A persistent foreground service (with a status bar notification) runs sync in the background
- The notification shows the 4-state sync icon (same states as F2)
- The service starts when the app is first opened and persists until the user disables it in settings
- When I open the app, any changes synced while it was backgrounded are already applied
- The foreground service survives system-initiated process death (tested on real device)

### G3 — Edge swipe to open sidebar
**M6** | As the user, I want to swipe from the left edge of the screen to open the sidebar
so that navigation is a natural one-handed gesture.

Acceptance criteria:
- A swipe starting within 20px of the left edge opens the sidebar
- The sidebar animates in (CSS transform)
- The gesture does not trigger if an input field is focused
- Implemented via `@capacitor/gesture` (not CSS-only) for reliable edge detection

### G4 — Long-press for quick-peek on mobile
**M6** | As the user, I want to long-press a `[[link]]` on mobile to see the quick-peek
overlay so that I can preview a linked note with one finger.

Acceptance criteria:
- A 500ms touch hold on a wiki-link opens the quick-peek panel (same read-only panel as C4)
- A tap outside the panel or an upward swipe dismisses it
- The long-press does not trigger text selection (prevent default)

### G5 — Pinch to zoom in graph
**M6** | As the user, I want to use pinch-to-zoom in the graph view on mobile so that I can
explore the graph with natural gestures.

Acceptance criteria:
- Pinch-to-zoom zooms the Cytoscape graph
- `user-scalable=no` is set in the meta viewport tag so the OS page zoom does not interfere
- The gesture is handled by Cytoscape's built-in touch support

### G6 — Pull-to-sync
**M6** | As the user, I want to pull down on the note list to trigger an immediate sync so
that I can manually force a sync refresh.

Acceptance criteria:
- Pulling down past a threshold on the note list triggers `forceSync()`
- A loading indicator is shown during the forced sync
- The note list updates after the sync completes
- The pull gesture does not interfere with normal scrolling

### G7 — Fast cold start
**M6** | As the user, I want the app to be usable within 3 seconds of launching so that
opening it on my phone is not frustrating.

Acceptance criteria:
- The app shell (sidebar + editor pane) renders immediately from local Capacitor assets
- Vault indexing runs in a Web Worker; the sidebar populates incrementally as notes are indexed
- Search and graph are available once indexing is complete
- Target: <3s to a usable state on a mid-range Android device with ~500 notes
- The foreground service's sync does not block the UI thread during cold start

---

## Epic H — Import / Export

### H1 — Export vault to ZIP
**M5** | As the user, I want to export my entire vault as a ZIP file so that I have a
portable backup of all my notes and attachments.

Acceptance criteria:
- Settings → Export → "Export vault as ZIP" triggers an Electron save dialog
- The ZIP contains all `.md` files and all note-adjacent attachment folders, preserving the folder structure
- Progress is shown during export (note count)
- On completion, the containing folder is opened in the OS file manager
- The ZIP is a valid ZIP archive readable by any standard unzip tool

### H2 — Import from Anytype [post-MVP, M8]
**M8** | As the user, I want to import my existing notes from Anytype so that I can migrate
my knowledge base without manually recreating every note.

Acceptance criteria:
- Settings → Import → "Import from Anytype" opens a file picker for the Anytype export ZIP
- A preview shows how many notes will be imported and a mapping summary (Anytype relations → tags, Anytype links → wikilinks)
- I can confirm or cancel before any files are written
- After import, all notes appear in the vault with correct frontmatter (tags from Anytype relations, links converted to `[[Title]]` wikilinks)
- The import does not overwrite existing notes with the same title (prompts for conflict resolution)

*Note: The Anytype export schema and attachment volume must be confirmed before M8 implementation begins. See `requirements.md` TBD item.*

---

## Epic I — Theming, Settings & Onboarding

### I1 — Dark mode as primary theme
**M1** | As the user, I want the app to use dark mode by default so that it's comfortable
for extended writing sessions.

Acceptance criteria:
- The app opens in dark mode by default
- The theme is detected from system preference (`prefers-color-scheme`) on first launch
- The user's explicit choice overrides system preference and is persisted in `localStorage`
- Switching theme is instant (no page reload, no flash)

### I2 — 6 accent colour presets
**M1** | As the user, I want to choose my accent colour from a small set of presets so that
I can personalise the app without the complexity of a hex colour picker.

Acceptance criteria:
- Settings → Appearance shows exactly 6 colour swatches: Indigo, Teal, Rose, Amber, Violet, Slate
- Clicking a swatch immediately applies the accent colour to all interactive elements (links, focus rings, active sidebar item, graph focal node)
- The selected preset is persisted in `localStorage`
- There is no free hex colour input

### I3 — Light mode available
**M1** | As the user, I want the option to switch to light mode even though dark mode is
the default so that I can use the app in bright environments.

Acceptance criteria:
- A light/dark toggle exists in Settings → Appearance
- Light mode uses a legible, pleasant colour scheme (not just inverted dark mode)
- The theming system (Tailwind `darkMode: 'class'`) supports adding more themes in the future without a rewrite

### I4 — Settings screen
**M1** | As the user, I want a dedicated settings screen so that I can configure the app
without editing config files.

Acceptance criteria:
- Settings is accessible from the sidebar or command palette
- Sections: Appearance (theme, accent), Sync (mode, server URL/token in M5/M7), Editor (font size TBD)
- Changes take effect immediately; no "Save" button required
- Settings are stored in Electron `app.getPath('userData')` (not in the vault)

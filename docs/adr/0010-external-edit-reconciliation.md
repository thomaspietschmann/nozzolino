# ADR-0010: External Edit Reconciliation

- **Date:** 2026-06-22
- **Status:** Accepted
- **Gap addressed:** Not covered in any source document; decision needed before M5 implementation

---

## Context

`requirements.md` states "auto-refresh on all platforms — app automatically shows the
latest version when files change, no manual reload." It does not specify what happens
when a file changes externally **while the user has that note open in the editor with
unsaved changes**. This is the collision scenario.

This situation arises naturally in Syncthing mode: the user is editing a note on their
desktop; Syncthing delivers an update to the same note from their phone (where they
added a quick line earlier). Both changes are valid and neither should be silently discarded.

Without an explicit decision, implementations will differ across desktop and Android and
may silently drop user input.

---

## Decision

Two cases, based on whether the note in the editor has **unsaved local changes**:

### Case 1 — No local unsaved changes

The note is open in the editor but the user has not typed anything since the last save
(the "dirty" flag is false). An external file change arrives via `chokidar` or the mtime
poller.

**Action:** Silently reload the note content from disk, update the ProseMirror document,
and update the `NoteRecord` in the index. No notification to the user. The sync dot may
briefly show yellow (syncing) during the reload.

This matches the "auto-refresh" requirement with no disruption.

### Case 2 — Local unsaved changes exist

The note is open and the user has typed content that has not yet been written to disk
(the dirty flag is true; the 1-second auto-save debounce has not fired yet). An external
file change arrives.

**Action:** Treat this as a conflict. Specifically:

1. **Do not discard the local changes.** The user's in-progress edit is kept in the editor.
2. **Save the external version to disk** as a conflict file (using the same naming convention
   as Syncthing: `<note-stem>.sync-conflict-<timestamp>.md`).
3. **Add a `ConflictRecord`** to `conflictsSlice` for this note.
4. **Surface the conflict banner** at the top of the note: "This file was changed externally
   while you were editing. Tap to review versions side by side."
5. The user resolves the conflict using the same M5 conflict resolution UI (side-by-side diff,
   manual merge, "Mark as resolved").

This reuses the existing conflict resolution infrastructure and ensures no input is silently lost.

---

## Rationale

**Why not auto-merge?**
The requirements explicitly specify manual conflict resolution: "user is presented with the two
conflicting versions and manually edits a merged result." Auto-merging would contradict this.

**Why use the Syncthing conflict file naming convention?**
Consistency. The conflict resolution UI (M5) is already built to detect and display
Syncthing-format conflict files. Reusing the same convention means the UI needs no changes.
The `.sync-conflict-<timestamp>` suffix also makes it clear to the user (and to Syncthing
itself) that this file is a conflict artefact, not a real note.

**Why not just alert the user and block the save?**
A modal interrupt while the user is typing is disruptive. The conflict banner is non-blocking
— the user can finish their thought, then resolve the conflict at their convenience.

**Timing edge case:**
The 1-second auto-save debounce means there is a 1-second window where local changes
exist but have not been written to disk. If an external change arrives within that window,
Case 2 applies. If the auto-save fires before the external change is detected, Case 1 applies
(no local changes outstanding, safe to reload).

---

## Consequences

- The conflict banner must distinguish between "conflict from Syncthing" (the external file
  is a `.sync-conflict-` file) and "conflict from external edit during session" (the conflict
  file was created by the app). Both use the same resolution UI; the banner copy can be generic.
- On Android, the mtime poller fires on a 30-second interval. The collision window for Case 2
  is wider than on desktop (where `chokidar` detects changes within milliseconds). This means
  it is possible on Android for the user to save their edit before the poller detects the external
  change, causing the auto-save to overwrite the external version. In this case, the next poll
  cycle will detect the discrepancy via ETag comparison (in server mode) or by detecting a
  Syncthing conflict file (in Syncthing mode). The conflict is not silently lost — it surfaces
  on the next poll.

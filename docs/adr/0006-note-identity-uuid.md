# ADR-0006: Note Identity — Lazy UUID Assignment

- **Date:** 2026-06-22
- **Status:** Accepted
- **Gap addressed:** Not explicitly resolved in source documents; decision needed before M1 implementation

---

## Context

Each note needs a stable machine identity that survives renames. The filename changes when a
note is renamed; the UUID does not. The UUID is used by the sync server (M7) for conflict
detection and by the in-memory `VaultIndex` as a stable key.

`technical-guidelines.md` §4 specifies that `id` is a UUIDv4 written into frontmatter on the
note's "first indexing." This eager approach (write UUID to every note the moment the vault is
opened) has a serious side effect: if the user has hundreds of notes with no `id` field, the
first vault open causes a **mass rewrite** of all those files. This creates:

1. A large burst of `chokidar` events that the watcher re-processes.
2. A large burst of sync events if Syncthing is active — Syncthing will attempt to sync every
   note to all devices, generating unnecessary network traffic and potential conflicts.
3. A violation of the spirit of the "editable anywhere" principle — the app is modifying files
   the user did not explicitly save.

---

## Decision

**Lazy UUID assignment:** A UUID is written into a note's frontmatter only on the note's
**first explicit save through the app** (i.e., when the user creates or edits and saves a note).

At index time, notes without an `id` field are assigned an **in-memory UUID** that is
used for the current session only. This in-memory UUID is not written to disk.

If two devices are syncing via Syncthing before any note has been explicitly saved by
the app, there is a brief window where the same note may have different in-memory UUIDs
on different devices. This is acceptable because:

- The sync server (M7) uses ETag (content hash) as the primary conflict detection mechanism,
  not UUID.
- The in-memory index is rebuilt on every cold start, so stale in-memory UUIDs never persist.
- Once the user saves a note from the app, the UUID is written and becomes stable.

### On-disk behaviour

```typescript
// On index (NoteParser):
if (!frontmatter.id) {
  noteRecord.id = generateUUID();  // in-memory only; NOT written to file
} else {
  noteRecord.id = frontmatter.id;
}

// On save (file:write IPC handler):
if (!frontmatter.id) {
  frontmatter.id = noteRecord.id;  // write the in-memory UUID to frontmatter on first save
}
```

---

## Rationale

**Avoids mass-rewrite Syncthing churn:**
Opening the vault for the first time on a new device will not trigger a Syncthing sync
storm. Only notes that the user actually saves will get their UUID written.

**Respects "editable anywhere" principle:**
The app modifies a file only when the user takes an explicit action (saving a note). Passively
opening the vault does not alter any files.

**Deferred persistence is safe at M1–M6 scale:**
The sync server (M7) is post-MVP. UUID stability matters most for the server's conflict
detection mechanism. By the time M7 is implemented, most notes will already have been saved
once and will have a UUID on disk.

**Alternative considered and rejected — eager assignment with write-batching:**
Writing UUIDs in a background batch with a progress indicator was considered. Rejected
because it is still a mass file modification that the user did not request, and it adds
complexity (progress UI, error handling for partially-written batches).

---

## Consequences

- During the first session, notes that have never been saved through the app will have
  in-memory UUIDs only. If the app crashes before a save, those UUIDs are lost (a new
  in-memory UUID is generated on restart). This is acceptable — no UUID-dependent
  feature (sync server) is active during M1–M6.
- The `NoteRecord.id` field is always populated (either from disk or from in-memory
  generation), so the rest of the codebase can always read `noteRecord.id` without
  null checks.
- When M7 is implemented, the sync client should check whether a note has a persisted UUID
  before syncing it (i.e., trigger a save if the UUID is still in-memory-only, so the server
  receives a file with a stable `id` field).

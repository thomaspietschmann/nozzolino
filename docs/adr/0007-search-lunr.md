# ADR-0007: Full-Text Search — Lunr.js

- **Date:** 2026-06-22
- **Status:** Accepted
- **Source:** `technical-guidelines.md` §6 (Authoritative)

---

## Context

The app needs full-text search across note body content. Search results must appear within
300ms of the user stopping typing. The vault will contain at most a few hundred notes (hard
cap in requirements: will not reach 1,000). The app runs offline with no guaranteed network
connection. Search must work on both desktop and Android.

---

## Decision

**In-process full-text search using Lunr.js** (`lunr` npm package).

The Lunr index lives in `packages/search` and is built over `NoteRecord.bodyText`
(plain text stripped of Markdown syntax) and `NoteRecord.title`. It is rebuilt whenever
the `VaultIndex` changes, debounced 1 second after the last change event.

### Index scope

- **Indexed:** `bodyText` (frontmatter excluded), `title`
- **Not indexed:** `tags`, `emoji`, `uuid`, `created`, `modified`
- Tags are searchable via a separate code path (direct lookup in `tagIndex`), not via Lunr.

### Query behaviour

| Behaviour | Implementation |
|---|---|
| Case-insensitive | Lunr default (lowercase normalization) |
| Substring / prefix match | Wildcard suffix query: `term*` |
| Tag filter | Applied post-Lunr as a set intersection on `NoteRecord.tags`; bypasses Lunr when there is no text query |
| Snippet extraction | First 150-character window in `bodyText` containing the query term |
| Debounce | 300ms from last keystroke in the UI layer (not in `packages/search`) |
| Result shape | `{ noteId: string, title: string, snippet: string, score: number }` |

### Incremental update

Exposing `addToIndex(note)`, `updateInIndex(note)`, `removeFromIndex(id)` functions avoids
rebuilding the full Lunr index on every file change. Full rebuild happens only on vault open
or when the vault root changes.

### Result rendering

The search modal renders results as a flat list. `react-window` virtualisation is used
even though at <1,000 notes it is technically unnecessary — it costs nothing to add and
prevents any rendering issue if a query returns many results.

---

## Alternatives Rejected

**SQLite FTS (via `better-sqlite3` or `sql.js`):**
Works well but adds a persistent database file. This violates the "no hidden database" principle
and requires a migration strategy. Overkill at <1,000 notes.

**Flexsearch:**
Faster than Lunr at large scale but has less predictable tokenization behaviour and a less
stable API. Lunr's behaviour is well-documented and its index structure is inspectable.

**Server-side search (sending queries to the sync server):**
Requires network. The app must work fully offline. Rejected.

**Fuse.js (fuzzy search):**
Requirements specify exact substring matching, not fuzzy/approximate. Fuse.js's primary
feature is the thing explicitly excluded.

---

## Consequences

- Lunr's wildcard query (`term*`) matches prefixes, not arbitrary substrings. A search for
  `arch` will not match `architecture` unless `arch` is the start of a token. Lunr tokenizes
  on word boundaries. This approximates the "exact substring" requirement adequately for most
  queries (searching for the beginning of a word is the common case). True arbitrary substring
  search would require a trigram index, which is unnecessary complexity at this scale.
- Lunr index rebuild on vault open is synchronous and takes <50ms for 500 notes on any modern
  machine. No async chunking needed.
- On Android, the Lunr index is rebuilt in a Capacitor Web Worker to avoid blocking the UI thread.

# ADR-0004: File Format & Frontmatter Schema

- **Date:** 2026-06-22
- **Status:** Accepted
- **Source:** `technical-guidelines.md` §4, `requirements.md` §Storage & File Format

---

## Context

The core design principle is "files first" — the source of truth is always plain files on
disk, never a hidden database. Notes must be readable and editable in any text editor or
terminal without opening the app. This constrains every decision about the on-disk format.

---

## Decision

### File format

- Each note is a plain `.md` (Markdown) file.
- The filename stem (without `.md` extension) is the canonical title of the note.
- There is no separate title index — the filename is the title. Link resolution uses the filename.
- No proprietary database is the primary store. An in-memory `VaultIndex` is built at runtime
  from the files and is never persisted to disk (except for UUID sidecars — see [ADR-0006](0006-note-identity-uuid.md)).

### Frontmatter schema

```markdown
---
id: 550e8400-e29b-41d4-a716-446655440000
tags: [architecture, backend]
emoji: 🗄️
created: 2026-01-15T10:30:00Z
modified: 2026-06-20T14:22:11Z
---

Body content here.
```

| Field | Type | Rules |
|---|---|---|
| `id` | UUIDv4 string | Written lazily on first app save (see ADR-0006); never changed after assignment |
| `tags` | YAML list | Never a comma-string; `[]` when empty; maximum ~10 per note (soft cap) |
| `emoji` | string or absent | Optional; if absent, graph shows first letter of title as fallback |
| `created` | ISO 8601 UTC string | Set on first save if absent; never updated by the app after that |
| `modified` | ISO 8601 UTC string | Updated by the app on every save |

### Rules

- YAML frontmatter is always present after the first app save. The parser writes it if absent.
- The `# H1` heading in the body is optional and independent of the filename/title.
- `tags` is a YAML list, never a comma-string — this is the single source of truth for tags.
- `modified` is always updated by the app on save, even if the user only changed frontmatter.
- Files written externally (without the app) may lack frontmatter or `id`. The indexer handles
  this gracefully and writes missing fields on the next app save.

### Attachment storage

For a note at `vault/projects/my-note.md`, attachments are stored at
`vault/projects/my-note/<filename>`. The in-body reference is relative:

```markdown
![Screenshot](my-note/screenshot.png)
```

Larger linked files (PDFs, etc.) use standard Markdown links and can be stored anywhere in
the vault tree. The app does not manage them specially.

See [ADR-0005](0005-attachment-storage.md) for the full rationale.

---

## Rationale

**Filename = title:**
This makes wikilinks trivially resolvable (title string → filename → file path) without
maintaining a separate title index. It also means any file manager or `ls` shows note titles
directly. The trade-off is that filenames must be valid for the target OS (no `/`, no `\0`,
length limits). The app enforces these constraints on the rename UI.

**YAML frontmatter always present:**
Avoids conditional logic in every parser call. A note that has never been opened in the app
may lack frontmatter; the parser writes it on first save. After that, the invariant holds.

**No persisted database:**
Cold-start reads all `.md` files and rebuilds the index from scratch. At <1,000 notes this
takes under 200ms on desktop and under 3s on a mid-range Android device. The simplicity of
"no hidden state" is worth the cold-start cost at this scale.

---

## Consequences

- Renaming a note requires updating the filename. This triggers rename propagation of all
  `[[OldTitle]]` links vault-wide. See `packages/common` `replaceWikiLinkTarget`.
- Note titles must be valid filenames. The editor must prevent or escape characters that
  are invalid on Linux (`/`) and Android. Titles with these characters are rejected at
  create/rename time with a clear error.
- External editors that modify `modified` or add their own frontmatter fields will cause
  spurious `chokidar` events. The indexer handles unknown frontmatter fields by preserving them.

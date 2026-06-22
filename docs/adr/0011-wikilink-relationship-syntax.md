# ADR-0011: Wikilink & Relationship Syntax

- **Date:** 2026-06-22
- **Status:** Accepted
- **Gap addressed:** The choice of `[[Title||TYPE]]` syntax and its implications are not
  explicitly justified as a decision in the source documents. Documenting it here makes
  the trade-offs explicit.

---

## Context

Notes reference each other using wiki-link syntax. The app extends the standard
`[[Title]]` wiki-link with an optional relationship type: `[[Title||TYPE]]`.

This syntax is non-standard Markdown. Any non-standard inline syntax in `.md` files
has implications for portability, greppability, and the "editable anywhere" principle.

The relationship type is user-defined on the fly. The set of types is open (no predefined
vocabulary, except for autocomplete suggestions based on previously used types).

---

## Decision

### Syntax

```
[[Note Title]]                # plain wiki-link (no relationship type)
[[Note Title||client of]]     # wiki-link with relationship type
[[Note Title||DEPENDS_ON]]    # relationship types can be any case/format
```

Rules:
- `[[` and `]]` are the delimiters.
- The `||` separator is used because `|` alone is used in Markdown tables.
  Double-pipe avoids ambiguity and is visually distinctive.
- The title is the exact filename stem of the target note (case-sensitive on Linux;
  the indexer uses a case-sensitive lookup).
- The relationship type is everything between `||` and `]]`. It may contain spaces and
  most punctuation. It is stored verbatim.
- A wiki-link with no matching note on disk is valid syntax; it renders with a
  "missing" visual state in the editor and triggers the "create?" affordance.

### Single source of truth for the parsing regex

The canonical regex lives in `packages/common/src/wikilinks.ts`:

```typescript
export const WIKILINK_REGEX = /\[\[([^\]|]+?)(?:\|\|([^\]]+?))?\]\]/g;
// Group 1: title
// Group 2: relationship type (optional)
```

This regex is the only place in the codebase that defines what a wikilink looks like.
All other packages (`editor`, `vault`, `search`, `graph`) import from `packages/common`.

### Autocomplete

- Triggered in the editor when the user types `[[`.
- Suggestions are note titles from the in-memory `VaultIndex`.
- After `||`, suggestions are previously used relationship types from the `VaultIndex`
  (`relationshipTypeIndex: Set<string>`).
- Free-text entry is always allowed — the user can type a new relationship type inline.

---

## Rationale

**Why `||` and not `|`?**
Single `|` is used in Markdown table syntax. A wiki-link inside a table cell
(`| [[Note|alias]] |`) would be ambiguous. `||` is not used by any standard Markdown feature.

**Why not YAML frontmatter for relationships?**
The requirements specify inline relationship syntax: "Named relationships stored within the
Markdown files using extended wikilink syntax." Frontmatter relationships would be separated
from the text where the relationship is meaningful. Inline relationships are readable in
context when the file is opened in any editor.

**Why user-defined types?**
The requirements explicitly state: "Relationship types are user-defined on the fly: the user
can type any new relationship type inline." A fixed vocabulary would require a management UI
and would prevent the user from coining a type in the moment it's needed.

**Why not standard Markdown links?**
`[Note Title](path/to/note.md)` requires knowing the file path. If the note is moved or the
vault root changes, all links break. Wiki-links use the note title as the reference; path
resolution happens at runtime via the `titleToPath` index.

---

## Consequences

- **Portability:** `[[Title||TYPE]]` renders as literal text in any editor that doesn't
  understand wiki-links. It is readable (the structure is obvious to a human) but not
  a hyperlink. This is an acceptable trade-off for the "files first" principle.
- **Greppability:** `grep '[[' vault/` or `grep 'client of' vault/` finds all links of
  a given type. The syntax is designed to be grep-friendly.
- **Case sensitivity:** Note titles are case-sensitive on Linux (the filesystem is case-sensitive).
  A link to `[[my note]]` will not resolve to `My Note.md`. The editor must display a
  validation warning for this. Autocomplete helps prevent case mismatches.
- **Pipes in titles:** A note title containing `||` would break the parser. The app must
  reject note titles containing `||` at create/rename time (validation in the title input).
  This is an edge case that is unlikely in practice.
- **Non-standard Markdown:** Any Markdown processor that renders the vault files as HTML
  (e.g., a static site generator) will not render wiki-links as hyperlinks without a plugin.
  This is accepted — the app is the primary rendering surface, not a generic Markdown processor.

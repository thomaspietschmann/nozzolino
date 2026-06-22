# ADR-0003: Editor Engine — ProseMirror

- **Date:** 2026-06-22
- **Status:** Accepted
- **Source:** `technical-guidelines.md` §3 (Authoritative)
- **Resolves conflict:** See `source-reconciliation.md` — Conflict 4 (language count)

---

## Context

The editor is the most complex component. Key requirements that constrain the choice:

1. WYSIWYG with Typora-style cursor reveal — raw Markdown syntax is hidden everywhere
   except at the cursor position. This requires precise, programmable decoration control.
2. Custom `[[Title||TYPE]]` inline node for wiki-links with relationship types — not
   representable as a plain Markdown construct.
3. Visual table editing with drag-and-drop row/column reordering.
4. Syntax highlighting in code blocks without DOM mutation.
5. The implementation must be TypeScript-native and share cleanly with the Capacitor
   mobile build (same React tree).

---

## Decision

**Editor engine: ProseMirror** (`prosemirror-state`, `prosemirror-view`, `prosemirror-model`,
`prosemirror-markdown`, `prosemirror-inputrules`, `prosemirror-keymap`, `prosemirror-history`,
`prosemirror-tables`).

### Schema

| Node / Mark | Notes |
|---|---|
| Standard block nodes | `doc`, `paragraph`, `heading` (1–6), `blockquote`, `code_block` (with `language` attr), `horizontal_rule`, `hard_break` |
| List nodes | `ordered_list`, `bullet_list`, `list_item` |
| Table nodes | `table`, `table_row`, `table_cell`, `table_header` (from `prosemirror-tables`) |
| `image` | `src`, `alt`, `title` attrs; `src` is relative to vault root |
| `wiki_link` | Custom inline node. Attrs: `target` (note title string), `rel_type` (relationship type string or null) |
| Marks | `em`, `strong`, `code`, `link`, `strikethrough` |

### Custom plugins

| Plugin | Purpose |
|---|---|
| `cursor-reveal` | `DecorationSet` that strips render-hiding decorations from the current block; re-applies on blur/cursor-leave |
| `wikilink-input-rule` | Triggers on `[[`; opens autocomplete via Zustand action; inserts `wiki_link` node on confirm |
| `wikilink-hover` | On `mouseover` of a `wiki_link` node → opens quick-peek panel |
| `syntax-highlight` | Node view for `code_block`; applies `highlight.js` decorations (not DOM mutation) |
| `table-drag` | Node view wrapping `prosemirror-tables`; adds drag handles for rows and columns |
| `image-paste` | `handlePaste`; intercepts `image/*` clipboard data; writes via `VaultFS`; inserts `image` node |

### Syntax highlight languages

Exactly **7** registered languages: `bash`, `java`, `rust`, `ruby`, `javascript`, `typescript`, `kotlin`.
`highlight.js` auto-detect fallback is enabled for code blocks with no explicit language attr.
(Note: `action-items.md` counted 8 by treating auto-detect as a language. This is incorrect —
see `source-reconciliation.md` Conflict 4.)

### Markdown round-trip

- Parse: `prosemirror-markdown` `defaultMarkdownParser` extended with a custom wiki-link tokenizer
  that handles `[[Title]]` and `[[Title||TYPE]]` patterns.
- Serialize: `MarkdownSerializer` extended to write `wiki_link` nodes back to `[[Title||TYPE]]` syntax.

---

## Alternatives Rejected

**TipTap:** A ProseMirror wrapper explicitly rejected. It adds a React abstraction layer
that fights the decoration model needed for cursor-reveal. The `wiki_link` node requires
direct schema control that TipTap's extension API does not expose cleanly.

**Quill:** No programmable decoration API. Cannot implement cursor-reveal without hacks.
No `wiki_link` node concept.

**Milkdown:** Markdown-first, opinionated schema. The `[[Title||TYPE]]` syntax would require
overriding so much of the default schema that starting from ProseMirror directly is simpler.

**CodeMirror:** Text editor, not a rich-text editor. Would require building WYSIWYG rendering
from scratch. Wrong tool for this problem.

---

## Consequences

- ProseMirror has a steep learning curve and verbose API. The `packages/editor` package will
  be complex. This is accepted — the alternatives do not meet the requirements.
- The `wiki_link` inline node means the `.md` files, when opened in other editors, will show
  `[[Title||TYPE]]` as raw text (not rendered). This is acceptable: wikilink syntax is greppable
  and readable as-is. See [ADR-0011](0011-wikilink-relationship-syntax.md).
- ProseMirror is maintained but not actively developed (stable API, infrequent releases).
  This is a feature, not a bug, for a long-lived personal tool.

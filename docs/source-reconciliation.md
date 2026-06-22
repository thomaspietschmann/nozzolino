# Source Reconciliation

> **Purpose:** Document the four concrete conflicts found between the three source files
> (`requirements.md`, `technical-guidelines.md`, `action-items.md`) and record which
> source wins. All other planning documents in `docs/` follow the decisions below.
>
> Precedence rule: requirements.md > technical-guidelines.md > action-items.md (superseded).

---

## Conflict 1 — Attachment Storage Path

**What the conflict is:**
`requirements.md` line 25 explicitly states that images pasted into a note are stored in
"a folder adjacent to the note file (a sibling folder, not a vault-level attachments directory)".
`action-items.md` Phase 3, item 10 instructs writing image blobs to `<vault>/.assets/` — a
vault-level directory that the requirement explicitly prohibits.

**Resolution:** Sibling folder wins. For a note at `vault/projects/my-note.md`, attachments
live at `vault/projects/my-note/image.png`. The reference in the note body is relative:
`![](my-note/image.png)`.

**Source that wins:** `requirements.md` (product truth)

**Decision recorded in:** [ADR-0005](adr/0005-attachment-storage.md)

---

## Conflict 2 — Monorepo Package Names

**What the conflict is:**
`technical-guidelines.md` §2 defines a granular workspace layout:
`packages/{ui,editor,vault,search,graph,sync,common}` + `apps/{desktop,android}` + `server/`.
`action-items.md` Phase 0 scaffolds a different structure: `packages/{app,desktop,mobile,server,shared}` —
fewer, coarser packages that collapse editor, vault, search, graph and sync into a single `app` package.

**Resolution:** The granular structure wins. The technical guidelines are marked "Authoritative"
and the granularity is intentional: each package has a distinct responsibility boundary and
the `VaultFS` abstraction in `packages/vault` is specifically designed to swap implementations
(Node.js vs. Capacitor) without touching anything else.

**Source that wins:** `technical-guidelines.md` (technical truth)

**Decision recorded in:** [ADR-0002](adr/0002-monorepo-structure.md)

---

## Conflict 3 — Sync Server API Shape

**What the conflict is:**
`technical-guidelines.md` §11 specifies the sync server API as:
- Base path: `/api/files`
- Port: `8080`
- Auth env var: `SYNC_TOKEN`
- Conflict response: `409 Conflict`

`action-items.md` Phase 7 implements a different API:
- Base path: `/notes`
- Port: `3000`
- Auth env var: `AUTH_TOKEN`
- Conflict response: `412 Precondition Failed`

(Note: `412 Precondition Failed` is in fact semantically correct per HTTP — the `If-Match`
precondition failed — but the technical guidelines chose `409` for clarity to clients.
Either works; the decision is which document wins.)

**Resolution:** `technical-guidelines.md` wins on all four points. The sync server is
post-MVP (M7); this conflict is recorded now so the M7 implementation is unambiguous.

**Source that wins:** `technical-guidelines.md` (technical truth)

**Decision recorded in:** [ADR-0009](adr/0009-sync-strategy.md)

---

## Conflict 4 — Syntax Highlight Language Count

**What the conflict is:**
`requirements.md` line 59 lists exactly **7** required syntax highlight languages:
`bash`, `java`, `rust`, `ruby`, `javascript`, `typescript`, `kotlin`.
`action-items.md` Phase 3, item 8 refers to "the 8 required languages" and adds
"auto-detect fallback" as if it were an eighth language. Auto-detect is a feature of
highlight.js, not a language, and counting it inflates the number.

**Resolution:** Exactly 7 languages. Auto-detect as a highlight.js fallback is fine to
enable but is not a "required language" in the requirements sense.

**Source that wins:** `requirements.md` (product truth)

**Decision recorded in:** [ADR-0003](adr/0003-editor-prosemirror.md)
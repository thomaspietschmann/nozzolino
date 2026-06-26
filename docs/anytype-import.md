# Importing from Anytype

Migrate notes from an [Anytype](https://anytype.io) space into your vault. The importer
maps Anytype's relations and links onto the app's plain-Markdown model.

## What gets mapped

| Anytype | Vault |
|---------|-------|
| `Tag` relation | `tags:` in frontmatter |
| `Emoji` | `emoji:` in frontmatter |
| `Creation date` / `Last modified date` | `created:` / `modified:` |
| Internal link (`@`-mention) | `[[Wikilink]]` in the body |
| Attachment / pasted image | copied into the vault under `files/` |
| Object title (or first `# H1`) | the note filename |
| Custom relations (e.g. `Status`, `Repo`) | kept as extra frontmatter fields |
| Anytype-internal relations (`Object type`, `Backlinks`, `Links`, `Created by`, `id`) | dropped |

Untitled objects (no `# H1`) are named by their Anytype id.

## Step 1 — Export from Anytype

Anytype has no whole-space export. Export a hub note **with its linked objects** — Anytype
follows real `@`-mention links and pulls the connected graph.

1. Make sure notes are linked with **`@`-mentions** in the body. Only real `@`-mentions are
   followed by the export (a plain text link is not). Type `@`, pick the target note.
2. Open the hub note → **`•••` menu → Export**.
3. In the **Export Object** dialog set:
   - **Export format: Markdown**
   - **Zip archive: on**
   - **Include linked objects: on**
   - **Include files: on**
4. Export and note where the `.zip` lands.

> Tip: pick (or make) one note that `@`-links every other note, so a single export covers
> the whole set.

## Step 2 — Import into the app

1. Open the sidebar **⚙ Settings** panel.
2. Click **“↑ Import from Anytype…”**.
3. Choose the exported `.zip`. A preview shows note / tag / link / attachment counts.
4. Click **Import**. Notes, tags, wikilinks and attachments are written into the open vault.

Import currently runs on the desktop app.

## How links resolve

Anytype references link targets by filename slug, by object id, or by title, depending on
how they were created. The importer resolves all three forms, so `[Title](slug.md)`,
`[Title](<id>.md)` and `[[Title]]`-style links all become `[[Title]]` wikilinks. Links whose
target is not part of the export are left as-is and counted as “unresolved” in the preview.

## Limitations

- **Markdown export only** — not the Protobuf/`.pb.json` format.
- Attachments are copied verbatim into `files/`; existing body references already point there.
- The Anytype API cannot create `@`-mentions programmatically — only manual `@` linking in the
  Anytype app produces links the export will follow.

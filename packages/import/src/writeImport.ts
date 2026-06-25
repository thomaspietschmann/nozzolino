import { parseFrontmatter } from '@notes-app/common';
import { atomicWrite } from '@notes-app/vault';
import type { VaultOpsContext } from '@notes-app/vault';
import type { PreparedNote } from './model.js';

/**
 * Writes prepared notes to the vault.
 *
 * Strategy: write the full serialized content (frontmatter + body) directly via
 * `atomicWrite` so that tags, emoji, created and other fields we prepared are
 * preserved verbatim.  We do NOT use `writeNote` from vaultOps because that
 * function calls `mergeForSave` which would overwrite our prepared frontmatter
 * with a stripped-down merge (only keeping id/created/modified).
 *
 * After each write we call `ctx.index.addOrRefresh` so the note enters the
 * vault index and backlinks are queryable immediately, and `ctx.onDidWrite` so
 * any watcher integration can attribute the write as a self-write echo.
 *
 * NOTE: `atomicWrite` does not assign an id.  The id field is intentionally
 * omitted from PreparedNote content so that the first time the note is opened
 * via the app it gets an id assigned (ADR-0006).  If callers need ids they can
 * follow up with a saveNote pass — that is out of scope for import v1.
 */
export async function writeImport(
  ctx: VaultOpsContext,
  notes: PreparedNote[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const total = notes.length;

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    if (!note) continue;

    // Write the full prepared content (frontmatter already serialized)
    await atomicWrite(ctx.vaultFS, note.relativePath, note.content);
    ctx.onDidWrite?.(note.relativePath, note.content);
    await ctx.index.addOrRefresh(ctx.vaultFS, note.relativePath);

    onProgress?.(i + 1, total);
  }
}

/**
 * Extracts only the body from a PreparedNote's serialized content.
 * Provided as a utility for callers who need just the body.
 */
export function extractBody(content: string): string {
  return parseFrontmatter(content).body;
}

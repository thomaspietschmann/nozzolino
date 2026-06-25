import { parseFrontmatter } from '@notes-app/common';
import { atomicWrite } from '@notes-app/vault';
import type { VaultOpsContext } from '@notes-app/vault';
import type { PreparedNote, PreparedAttachment } from './model.js';

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
  attachments?: PreparedAttachment[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const attachmentList = attachments ?? [];
  const total = notes.length + attachmentList.length;
  let done = 0;

  for (const note of notes) {
    // Write the full prepared content (frontmatter already serialized)
    await atomicWrite(ctx.vaultFS, note.relativePath, note.content);
    ctx.onDidWrite?.(note.relativePath, note.content);
    await ctx.index.addOrRefresh(ctx.vaultFS, note.relativePath);

    onProgress?.(++done, total);
  }

  for (const att of attachmentList) {
    await ctx.vaultFS.writeBinaryFile(att.vaultPath, att.base64);
    // No onDidWrite for binaries — they are not tracked by the text index.
    onProgress?.(++done, total);
  }
}

/**
 * Extracts only the body from a PreparedNote's serialized content.
 * Provided as a utility for callers who need just the body.
 */
export function extractBody(content: string): string {
  return parseFrontmatter(content).body;
}

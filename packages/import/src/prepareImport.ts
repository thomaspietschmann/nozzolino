import type { ImportSource } from './ImportSource.js';
import type { PreparedNote, ImportSummary, PreparedAttachment } from './model.js';
import { parseAnytypeBundle } from './anytypeMarkdownParser.js';
import { mapObjects } from './mapAnytype.js';

/**
 * Parse and map an Anytype import bundle into vault-ready notes and attachments.
 * This is a pure "preview" step — no vault writes occur.
 *
 * Attachments are deduplicated by path, read as binary from the source, and
 * base64-encoded so they can be written verbatim via `writeBinaryFile`.
 * The `vaultPath` matches the original ref so no link rewriting is needed.
 */
export async function prepareImport(
  source: ImportSource
): Promise<{ notes: PreparedNote[]; attachments: PreparedAttachment[]; summary: ImportSummary }> {
  const objects = await parseAnytypeBundle(source);
  const { notes, summary } = mapObjects(objects);

  // Collect distinct attachment refs across all objects
  const seen = new Set<string>();
  const attachments: PreparedAttachment[] = [];
  for (const obj of objects) {
    for (const { ref } of obj.attachments) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      try {
        const bytes = await source.readBinary(ref);
        const base64 = Buffer.from(bytes).toString('base64');
        attachments.push({ vaultPath: ref, base64 });
      } catch {
        // Attachment missing from source — skip silently
      }
    }
  }

  return { notes, attachments, summary };
}

import type { ImportSource } from './ImportSource.js';
import type { PreparedNote, ImportSummary } from './model.js';
import { parseAnytypeBundle } from './anytypeMarkdownParser.js';
import { mapObjects } from './mapAnytype.js';

/**
 * Parse and map an Anytype import bundle into vault-ready notes.
 * This is a pure "preview" step — no vault writes occur.
 */
export async function prepareImport(
  source: ImportSource
): Promise<{ notes: PreparedNote[]; summary: ImportSummary }> {
  const objects = await parseAnytypeBundle(source);
  return mapObjects(objects);
}

import { diffLines } from 'diff';
import { SYNCTHING_CONFLICT_INFIX } from '@notes-app/common';
import { basename, dirname, join } from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiffSegment {
  type: 'equal' | 'added' | 'removed';
  value: string;
}

// ─── Conflict filename helpers ────────────────────────────────────────────────

/**
 * Returns true when the filename contains the Syncthing conflict infix.
 * Works on bare filenames; do not pass a full path.
 *
 * @example isConflictFile('note.sync-conflict-20240101-120000-AAAAAA.md') // true
 * @example isConflictFile('note.md') // false
 */
export function isConflictFile(filename: string): boolean {
  return basename(filename).includes(SYNCTHING_CONFLICT_INFIX);
}

/**
 * Parses a Syncthing conflict filename and returns the stem of the primary note
 * and the full conflict tag, or null if it is not a conflict file.
 *
 * @example
 *   parseConflictFilename('My Note.sync-conflict-20240101-120000-AABBCC.md')
 *   // => { primaryStem: 'My Note', tag: '20240101-120000-AABBCC' }
 */
export function parseConflictFilename(
  filename: string,
): { primaryStem: string; tag: string } | null {
  const name = basename(filename);
  const idx = name.indexOf(SYNCTHING_CONFLICT_INFIX);
  if (idx === -1) return null;

  const primaryStem = name.slice(0, idx);
  // tag is everything after the infix up to (not including) the final '.md'
  const rest = name.slice(idx + SYNCTHING_CONFLICT_INFIX.length);
  const tag = rest.endsWith('.md') ? rest.slice(0, -3) : rest;

  if (!primaryStem || !tag) return null;
  return { primaryStem, tag };
}

/**
 * Builds a Syncthing-style conflict filename for a given primary stem + timestamp.
 * The timestamp should be a string in the format 'YYYYMMDD-HHmmss' or an ISO string
 * (the function strips non-alphanumeric characters from the time portion).
 *
 * @example makeConflictFilename('My Note', '2024-01-01T12:00:00.000Z')
 * //       'My Note.sync-conflict-20240101-120000-LOCAL.md'
 */
export function makeConflictFilename(primaryStem: string, timestamp: string): string {
  // Normalise ISO timestamp → 'YYYYMMDD-HHmmss'
  const normalised = timestamp
    .replace(/[^0-9T]/g, '')      // strip dashes, colons, Z
    .replace('T', '-')            // 'YYYYMMDDTHHMMSS' → 'YYYYMMDD-HHMMSS'
    .slice(0, 15);                // keep exactly 'YYYYMMDD-HHMMSS'
  return `${primaryStem}${SYNCTHING_CONFLICT_INFIX}${normalised}-LOCAL.md`;
}

/**
 * Given the relative path of a conflict file, returns the relative path of the
 * primary note, or null if the file is not a conflict file.
 *
 * @example primaryPathForConflict('sub/My Note.sync-conflict-20240101-120000-AABBCC.md')
 *          // => 'sub/My Note.md'
 */
export function primaryPathForConflict(conflictRelPath: string): string | null {
  const name = basename(conflictRelPath);
  const parsed = parseConflictFilename(name);
  if (!parsed) return null;
  return join(dirname(conflictRelPath), `${parsed.primaryStem}.md`);
}

// ─── Line diff ────────────────────────────────────────────────────────────────

/**
 * Computes a line-level diff between two text strings.
 * Returns segments with type 'equal' | 'added' | 'removed'.
 * 'added'   = present in `conflict`, not in `current`
 * 'removed' = present in `current`, not in `conflict`
 */
export function lineDiff(current: string, conflict: string): DiffSegment[] {
  return diffLines(current, conflict).map((part) => {
    const type: DiffSegment['type'] = part.added
      ? 'added'
      : part.removed
        ? 'removed'
        : 'equal';
    return { type, value: part.value };
  });
}

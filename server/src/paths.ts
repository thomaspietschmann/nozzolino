import { posix, sep } from 'node:path';

/** Reserved directory holding ETag sidecars; never exposed via the API. */
export const META_DIR = '.meta';

/**
 * Validates and normalises a vault-relative path coming from the API.
 * Rejects absolute paths, traversal (`..`), and anything under `.meta`.
 * Returns a clean POSIX relative path, or null if invalid.
 */
export function sanitizeRelPath(raw: string): string | null {
  if (!raw) return null;
  // Decode percent-encoding defensively (Express usually decodes params already).
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  // Normalise separators to POSIX.
  const unixed = decoded.split(sep).join('/');
  if (unixed.startsWith('/')) return null;
  const normalized = posix.normalize(unixed);
  if (
    normalized === '.' ||
    normalized.startsWith('../') ||
    normalized === '..' ||
    normalized.includes('/../') ||
    normalized.endsWith('/..')
  ) {
    return null;
  }
  if (normalized.startsWith('/')) return null;
  const first = normalized.split('/')[0];
  if (first === META_DIR) return null;
  return normalized;
}

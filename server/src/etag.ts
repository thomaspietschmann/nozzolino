import { createHash } from 'node:crypto';

/**
 * ETag = SHA-256 of file content, first 16 hex chars (ADR-0009).
 * Reimplemented locally so the server image carries no workspace dependency.
 */
export function computeEtag(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

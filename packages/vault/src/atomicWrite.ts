import { posixDirname, posixBasename, posixJoin } from '@notes-app/common';
import type { VaultFS } from './VaultFS.js';

/**
 * Write content atomically: write to a temp file, then rename into place.
 * Prevents a crashed write from leaving a truncated note file.
 */
export async function atomicWrite(
  vaultFS: VaultFS,
  relativePath: string,
  content: string,
): Promise<void> {
  const dir = posixDirname(relativePath);
  const tmpName = `.${posixBasename(relativePath)}.tmp`;
  const tmp = dir === '.' ? tmpName : posixJoin(dir, tmpName);
  await vaultFS.writeFile(tmp, content);
  await vaultFS.renameFile(tmp, relativePath);
}

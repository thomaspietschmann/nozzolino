import { promises as fs } from 'fs';
import { dirname, basename, join } from 'path';

/**
 * Write content atomically: write to a temp file, then rename into place.
 * Prevents a crashed write from leaving a truncated note file.
 */
export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = dirname(filePath);
  const tmp = join(dir, `.${basename(filePath)}.tmp`);
  await fs.writeFile(tmp, content, 'utf-8');
  await fs.rename(tmp, filePath);
}

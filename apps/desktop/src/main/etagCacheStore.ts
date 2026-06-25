import { promises as fs } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { InMemoryEtagCache } from '@notes-app/sync';

type AllCaches = Record<string, Record<string, string>>;

// Resolve lazily so E2E userData overrides applied in index.ts take effect.
function cachePath(): string {
  return join(app.getPath('userData'), 'sync-etag-cache.json');
}

async function readAll(): Promise<AllCaches> {
  try {
    return JSON.parse(await fs.readFile(cachePath(), 'utf-8')) as AllCaches;
  } catch {
    return {};
  }
}

/**
 * Disk-backed ETag cache keyed by vault path, so switching vaults is safe and
 * the last-acknowledged server state survives restarts (M7).
 */
export class FileEtagCache extends InMemoryEtagCache {
  constructor(private readonly vaultKey: string) {
    super();
  }

  override async load(): Promise<void> {
    const all = await readAll();
    this.fromJSON(all[this.vaultKey] ?? {});
  }

  override async persist(): Promise<void> {
    const all = await readAll();
    all[this.vaultKey] = this.toJSON();
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    await fs.writeFile(cachePath(), JSON.stringify(all), 'utf-8');
  }
}

import type { SyncStatus } from '@notes-app/common';
import { isConflictFile } from './conflicts.js';
import { SyncError } from './SyncClient.js';
import type {
  LocalFileEntry,
  ServerFileEntry,
  SyncDeps,
  SyncFS,
  SyncResult,
} from './syncTypes.js';

const defaultShouldSync = (path: string): boolean =>
  path.endsWith('.md') && !isConflictFile(path) && !path.endsWith('.tmp');

/**
 * Bidirectional sync engine for the bundled server (ADR-0009, M7).
 *
 * Per-file three-way reconciliation using a persisted last-acknowledged ETag:
 *   - local changed only        → PUSH
 *   - server changed only       → PULL
 *   - both changed              → CONFLICT (server onto primary, local → conflict copy)
 *   - new local / new server    → PUSH / PULL
 *   - deleted on one side       → propagate delete
 * No automatic merge; conflicts route into the existing M5 resolution UI.
 */
export class SyncEngine {
  private running = false;

  constructor(private readonly deps: SyncDeps) {}

  private get shouldSync() {
    return this.deps.shouldSync ?? defaultShouldSync;
  }

  /** Walks the vault via fs.listDirectory and returns syncable files. */
  private async listLocalFiles(fs: SyncFS): Promise<LocalFileEntry[]> {
    const out: LocalFileEntry[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.listDirectory(dir);
      } catch {
        return;
      }
      for (const ent of entries) {
        const base = ent.path.split('/').pop() ?? ent.path;
        if (base.startsWith('.')) continue; // skip dotfiles + .meta
        if (ent.isDirectory) {
          await walk(ent.path);
        } else if (this.shouldSync(ent.path)) {
          let mtime = 0;
          try {
            mtime = (await fs.stat(ent.path)).mtime.getTime();
          } catch {
            /* ignore */
          }
          out.push({ path: ent.path, mtime });
        }
      }
    };
    await walk('');
    return out;
  }

  /** Runs a single sync pass. Re-entrant calls are skipped (returns offline-safe no-op). */
  async syncOnce(): Promise<SyncResult> {
    const result: SyncResult = {
      pushed: [],
      pulled: [],
      conflicted: [],
      deletedLocal: [],
      deletedRemote: [],
      status: 'synced',
    };
    if (this.running) return result;
    this.running = true;
    const { client, fs, cache, hash, onConflict, onStatus, onLocalWrite, onLocalDelete } =
      this.deps;

    onStatus('syncing');
    try {
      await cache.load();
      let serverList: ServerFileEntry[];
      try {
        serverList = await client.listFiles();
      } catch (err) {
        // Distinguish auth/other errors (error) from connectivity (offline).
        const status: SyncStatus = err instanceof SyncError && err.status ? 'error' : 'offline';
        result.status = status;
        onStatus(status);
        return result;
      }
      const localList = await this.listLocalFiles(fs);

      const serverMap = new Map(serverList.map((e) => [e.path, e]));
      const localMap = new Map(localList.map((e) => [e.path, e]));
      const allPaths = new Set<string>([...serverMap.keys(), ...localMap.keys()]);

      for (const path of allPaths) {
        if (!this.shouldSync(path)) continue;
        const s = serverMap.get(path);
        const l = localMap.get(path);
        const known = cache.get(path);

        // ── Both exist ────────────────────────────────────────────────────
        if (s && l) {
          const localContent = await fs.readFile(path);
          const localEtag = await hash(localContent);
          if (localEtag === s.etag) {
            cache.set(path, s.etag);
            continue;
          }
          const localChanged = known === undefined || localEtag !== known;
          const serverChanged = known === undefined || s.etag !== known;

          if (localChanged && !serverChanged) {
            const res = await client.putFile(path, localContent, known ?? s.etag);
            if (res.ok) {
              cache.set(path, res.etag);
              result.pushed.push(path);
            } else {
              await onConflict(path, res.serverContent);
              cache.set(path, res.etag);
              result.conflicted.push(path);
            }
          } else if (serverChanged && !localChanged) {
            const { content } = await client.getFile(path);
            await fs.writeFile(path, content);
            await onLocalWrite?.(path, content);
            cache.set(path, s.etag);
            result.pulled.push(path);
          } else {
            // Both changed → conflict. Pull server content, hand to M5 flow.
            const { content } = await client.getFile(path);
            await onConflict(path, content);
            cache.set(path, s.etag);
            result.conflicted.push(path);
          }
          continue;
        }

        // ── Server only ───────────────────────────────────────────────────
        if (s && !l) {
          if (known === undefined) {
            // New on server → pull.
            const { content } = await client.getFile(path);
            await fs.writeFile(path, content);
            await onLocalWrite?.(path, content);
            cache.set(path, s.etag);
            result.pulled.push(path);
          } else {
            // We had it, deleted locally → propagate delete to server.
            await client.deleteFile(path, known);
            cache.delete(path);
            result.deletedRemote.push(path);
          }
          continue;
        }

        // ── Local only ────────────────────────────────────────────────────
        if (l && !s) {
          if (known === undefined) {
            // New local → push.
            const localContent = await fs.readFile(path);
            const res = await client.putFile(path, localContent);
            if (res.ok) {
              cache.set(path, res.etag);
              result.pushed.push(path);
            } else {
              await onConflict(path, res.serverContent);
              cache.set(path, res.etag);
              result.conflicted.push(path);
            }
          } else {
            // Server deleted it → delete locally.
            await fs.deleteFile(path);
            await onLocalDelete?.(path);
            cache.delete(path);
            result.deletedLocal.push(path);
          }
        }
      }

      await cache.persist();
      result.status = result.conflicted.length > 0 ? 'error' : 'synced';
      onStatus(result.status);
      return result;
    } catch {
      result.status = 'error';
      onStatus('error');
      return result;
    } finally {
      this.running = false;
    }
  }
}

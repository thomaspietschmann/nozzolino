import type { SyncStatus } from '@notes-app/common';
import { base64ToBytes, bytesToBase64, sha256Hex16Bytes } from '@notes-app/common';
import { isConflictFile } from './conflicts.js';
import { SyncError } from './SyncClient.js';
import type {
  LocalFileEntry,
  ServerFileEntry,
  SyncDeps,
  SyncFS,
  SyncResult,
} from './syncTypes.js';

/**
 * Default sync filter: include both notes (`.md`) and binary attachments
 * (e.g. `files/img.png`). Excludes conflict copies, *.tmp scratch files, and
 * dotfiles / .meta (the walk also skips dotfiles, this guards explicit paths).
 */
const defaultShouldSync = (path: string): boolean => {
  if (isConflictFile(path)) return false;
  if (path.endsWith('.tmp')) return false;
  const base = path.split('/').pop() ?? path;
  if (base.startsWith('.')) return false;
  return true;
};

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
    const { client, fs, cache, onStatus } = this.deps;

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

        if (path.endsWith('.md')) {
          await this.reconcileText(path, s, l, known, result);
        } else {
          await this.reconcileBinary(path, s, l, known, result);
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

  /** Text (`.md`) three-way reconciliation — the original M7 flow. */
  private async reconcileText(
    path: string,
    s: ServerFileEntry | undefined,
    l: LocalFileEntry | undefined,
    known: string | undefined,
    result: SyncResult,
  ): Promise<void> {
    const { client, fs, cache, hash, onConflict, onLocalWrite, onLocalDelete } = this.deps;

    // ── Both exist ────────────────────────────────────────────────────
    if (s && l) {
      const localContent = await fs.readFile(path);
      const localEtag = await hash(localContent);
      if (localEtag === s.etag) {
        cache.set(path, s.etag);
        return;
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
      return;
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
      return;
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

  /**
   * Binary attachment reconciliation. Mirrors {@link reconcileText} but:
   *   - hashes raw bytes (sha256Hex16Bytes) instead of UTF-8 content;
   *   - ferries bytes through base64 across the string-only VaultFS boundary;
   *   - resolves a both-changed conflict last-write-wins to the SERVER version
   *     (a 3-way text merge is meaningless for an image/PDF), counted as a pull.
   */
  private async reconcileBinary(
    path: string,
    s: ServerFileEntry | undefined,
    l: LocalFileEntry | undefined,
    known: string | undefined,
    result: SyncResult,
  ): Promise<void> {
    const { client, fs, cache, onLocalWrite, onLocalDelete } = this.deps;

    const pull = async (): Promise<void> => {
      const { bytes, etag } = await client.getBinary(path);
      await fs.writeBinaryFile(path, bytesToBase64(bytes));
      await onLocalWrite?.(path, '');
      cache.set(path, etag);
      result.pulled.push(path);
    };

    const push = async (ifMatch?: string): Promise<void> => {
      const bytes = base64ToBytes(await fs.readBinaryFile(path));
      const res = await client.putBinary(path, bytes, ifMatch);
      if (res.ok) {
        cache.set(path, res.etag);
        result.pushed.push(path);
      } else {
        // Server advanced underneath us → last-write-wins the server copy.
        await pull();
      }
    };

    // ── Both exist ────────────────────────────────────────────────────
    if (s && l) {
      const localEtag = await sha256Hex16Bytes(base64ToBytes(await fs.readBinaryFile(path)));
      if (localEtag === s.etag) {
        cache.set(path, s.etag);
        return;
      }
      const localChanged = known === undefined || localEtag !== known;
      const serverChanged = known === undefined || s.etag !== known;

      if (localChanged && !serverChanged) {
        await push(known ?? s.etag);
      } else if (serverChanged && !localChanged) {
        await pull();
      } else {
        // Both changed → no meaningful merge. Last-write-wins the server copy.
        await pull();
      }
      return;
    }

    // ── Server only ───────────────────────────────────────────────────
    if (s && !l) {
      if (known === undefined) {
        await pull();
      } else {
        await client.deleteFile(path, known);
        cache.delete(path);
        result.deletedRemote.push(path);
      }
      return;
    }

    // ── Local only ────────────────────────────────────────────────────
    if (l && !s) {
      if (known === undefined) {
        await push();
      } else {
        await fs.deleteFile(path);
        await onLocalDelete?.(path);
        cache.delete(path);
        result.deletedLocal.push(path);
      }
    }
  }
}

import type { BrowserWindow } from 'electron';
import { IPC, sha256Hex16 } from '@notes-app/common';
import type { SyncSettings, SyncStatus } from '@notes-app/common';
import { SyncClient, SyncEngine } from '@notes-app/sync';
import type { SyncFS } from '@notes-app/sync';
import { createConflictFromExternal as createConflictFromExternalOp } from '@notes-app/vault';
import type { VaultOpsContext } from '@notes-app/vault';
import { FileEtagCache } from './etagCacheStore.js';

const POLL_INTERVAL_MS = 60_000;

let engine: SyncEngine | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

export interface StartSyncDeps {
  config: SyncSettings;
  ctx: VaultOpsContext;
  vaultKey: string;
  win: BrowserWindow;
}

/** Stops any running poll loop and clears the engine. */
export function stopSync(): void {
  if (timer) clearInterval(timer);
  timer = null;
  engine = null;
}

/**
 * Starts server-mode sync for the open vault (M7). No-op unless syncMode is
 * 'server' with a URL + token. Runs an immediate pass then polls every 60s.
 */
export function startSync(deps: StartSyncDeps): void {
  stopSync();
  const { config, ctx, vaultKey, win } = deps;
  if (config.syncMode !== 'server' || !config.serverUrl || !config.syncToken) return;

  const vaultFS = ctx.vaultFS;
  const client = new SyncClient(config.serverUrl, config.syncToken);

  // Wrap the vault FS so engine writes are attributed as self-writes (suppresses
  // the chokidar echo that would otherwise look like an external change).
  const fs: SyncFS = {
    readFile: (p) => vaultFS.readFile(p),
    writeFile: async (p, c) => {
      ctx.onDidWrite?.(p, c);
      await vaultFS.writeFile(p, c);
    },
    deleteFile: (p) => vaultFS.deleteFile(p),
    listDirectory: (p) => vaultFS.listDirectory(p),
    exists: (p) => vaultFS.exists(p),
    stat: (p) => vaultFS.stat(p),
  };

  engine = new SyncEngine({
    client,
    fs,
    cache: new FileEtagCache(vaultKey),
    hash: sha256Hex16,
    onStatus: (status: SyncStatus) => win.webContents.send(IPC.SYNC_STATUS_CHANGED, status),
    onConflict: async (path, serverContent) => {
      // Snapshot the current local version into a conflict copy (reuses M5),
      // then write the server version onto the primary path.
      const record = await createConflictFromExternalOp(ctx, path, new Date().toISOString());
      ctx.onDidWrite?.(path, serverContent);
      await vaultFS.writeFile(path, serverContent);
      const rec = await ctx.index.addOrRefresh(vaultFS, path);
      win.webContents.send(IPC.VAULT_CONFLICT_DETECTED, record);
      win.webContents.send(IPC.VAULT_FILE_CHANGED, {
        event: 'change',
        relativePath: path,
        record: rec,
        selfWrite: true,
      });
    },
    onLocalWrite: async (path) => {
      const rec = await ctx.index.addOrRefresh(vaultFS, path);
      win.webContents.send(IPC.VAULT_FILE_CHANGED, {
        event: 'change',
        relativePath: path,
        record: rec,
        selfWrite: true,
      });
    },
    onLocalDelete: async (path) => {
      ctx.index.removeByPath(path);
      win.webContents.send(IPC.VAULT_FILE_CHANGED, { event: 'unlink', relativePath: path });
    },
  });

  void engine.syncOnce();
  timer = setInterval(() => {
    void engine?.syncOnce();
  }, POLL_INTERVAL_MS);
}

/** Runs an immediate sync pass (force-sync button / SYNC_FORCE_SYNC). */
export async function forceSync(): Promise<void> {
  await engine?.syncOnce();
}

/** Tests a server URL + token by hitting /api/health. */
export async function testConnection(
  url: string,
  token: string,
): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const res = await new SyncClient(url, token).health();
    return { ok: res.ok, version: res.version };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

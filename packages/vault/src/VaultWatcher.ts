import chokidar from 'chokidar';

export type WatchEvent = 'add' | 'change' | 'unlink';

/**
 * NOTE: Desktop's chokidar-backed `watchVault` passes **absolute** paths to
 * the handler. Mobile's `CapacitorWatcher` (mtime poll) uses **vault-relative
 * POSIX** paths instead — matching every VaultIndex / vaultOps API.
 */
export interface WatchHandler {
  (event: WatchEvent, absolutePath: string): void;
}

export interface VaultWatcher {
  close(): Promise<void>;
}

/**
 * Watches a vault directory for .md file changes using chokidar.
 * Events: 'add' | 'change' | 'unlink' for .md files only.
 */
export function watchVault(vaultRoot: string, handler: WatchHandler): VaultWatcher {
  const watcher = chokidar.watch(vaultRoot, {
    ignored: /(^|[/\\])\..|(node_modules)/,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });

  const mdOnly = (event: WatchEvent, path: string) => {
    if (path.endsWith('.md')) handler(event, path);
  };

  watcher
    .on('add', (p) => mdOnly('add', p))
    .on('change', (p) => mdOnly('change', p))
    .on('unlink', (p) => mdOnly('unlink', p));

  return {
    close: () => watcher.close(),
  };
}

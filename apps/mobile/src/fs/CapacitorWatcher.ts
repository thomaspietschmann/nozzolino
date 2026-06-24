import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import type { VaultFS, VaultIndex, ConflictScanEntry } from '@notes-app/vault';
import { scanVault } from '@notes-app/vault';
import type { NoteRecord, ConflictRecord } from '@notes-app/common';
import { sha1Hex } from '@notes-app/common';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileChangedPayload {
  event: 'add' | 'change' | 'unlink';
  relativePath: string;
  record?: NoteRecord;
  selfWrite: boolean;
}

/** Union of all payload types the watcher can emit. */
type EmitPayload = FileChangedPayload | ConflictRecord | string;

export interface CapacitorWatcher {
  /** Stop polling and remove foreground listener. */
  close(): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Poll interval while the app is in the foreground. */
const POLL_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Start an mtime-poll watcher for the open vault.
 *
 * Every POLL_INTERVAL_MS the watcher:
 * 1. Calls scanVault() to get the current list of .md files.
 * 2. stat()s each file and diffs against a path→mtime snapshot.
 * 3. For new/changed files: reads content, checks SHA-1 against
 *    `selfWriteHashes` (populated via VaultOpsContext.onDidWrite in the
 *    bridge). Own writes are silently skipped; external changes (e.g.
 *    Syncthing) emit `vault:fileChanged{selfWrite:false}`.
 * 4. For removed files: emits `vault:fileChanged{event:'unlink'}`.
 * 5. Runs a parallel conflict diff via `scanConflicts` (M6.5): newly
 *    appeared `.sync-conflict-*` files emit `vault:conflictDetected`;
 *    disappeared ones emit `vault:conflictRemoved`.
 *
 * The watcher is paused while the app is backgrounded (@capacitor/app
 * `appStateChange`) and runs one catch-up poll on foreground resume.
 *
 * NOTE: Unlike desktop's chokidar handler (absolute paths), all paths here
 * are vault-relative POSIX strings — matching every VaultIndex / vaultOps API.
 *
 * @param vaultFS        Open VaultFS implementation (CapacitorVaultFS on device).
 * @param index          Live VaultIndex for addOrRefresh / removeByPath.
 * @param emit           Bridge emit function — wraps the listeners Map.
 * @param selfWriteHashes  Shared Map<relPath, sha1> written by bridge onDidWrite.
 * @param scanConflicts  Thunk returning current conflict scan results (M6.5).
 */
export function watchVaultByPoll(
  vaultFS: VaultFS,
  index: VaultIndex,
  emit: (channel: string, payload: EmitPayload) => void,
  selfWriteHashes: Map<string, string>,
  scanConflicts?: () => Promise<ConflictScanEntry[]>,
): CapacitorWatcher {
  // snapshot: relPath → mtime epoch ms at last seen state
  const snapshot = new Map<string, number>();
  // conflictSnapshot: conflictRelPath → ConflictRecord (M6.5)
  const conflictSnapshot = new Map<string, ConflictRecord>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let polling = false;
  let appStateHandle: PluginListenerHandle | null = null;

  // ── Seed snapshots from the current vault state ─────────────────────────
  void (async () => {
    const paths = await scanVault(vaultFS);
    await Promise.all(
      paths.map(async (relPath) => {
        try {
          const { mtime } = await vaultFS.stat(relPath);
          snapshot.set(relPath, mtime.getTime());
        } catch {
          // Unreadable on seed — will be picked up on the first poll.
        }
      }),
    );

    // Seed the conflict snapshot so pre-existing conflicts (already emitted
    // by bridge.ts M6.5.1 on-open scan) are not re-emitted on the first poll.
    if (scanConflicts) {
      try {
        for (const { conflictRelPath, record } of await scanConflicts()) {
          conflictSnapshot.set(conflictRelPath, record);
        }
      } catch {
        // Non-fatal — first poll will detect them as new and emit.
      }
    }
  })();

  // ── Poll once ────────────────────────────────────────────────────────────
  async function poll(): Promise<void> {
    if (polling) return; // skip if the previous tick hasn't finished
    polling = true;
    try {
      const currentPaths = await scanVault(vaultFS);
      const currentSet = new Set(currentPaths);

      // Check for new or changed files.
      await Promise.all(
        currentPaths.map(async (relPath) => {
          try {
            const { mtime } = await vaultFS.stat(relPath);
            const mtimeMs = mtime.getTime();
            const prev = snapshot.get(relPath);
            if (prev === mtimeMs) return; // unchanged

            snapshot.set(relPath, mtimeMs);

            // Read content and compare SHA-1 to detect self-write echoes.
            const content = await vaultFS.readFile(relPath);
            if (selfWriteHashes.get(relPath) === sha1Hex(content)) return;

            // External change — update index and notify AppShell.
            const record = await index.addOrRefresh(vaultFS, relPath);
            const eventType = prev === undefined ? 'add' : 'change';
            emit('vault:fileChanged', {
              event: eventType,
              relativePath: relPath,
              record,
              selfWrite: false,
            });
          } catch {
            // Skip unreadable/transient files silently.
          }
        }),
      );

      // Check for removed files.
      for (const relPath of snapshot.keys()) {
        if (!currentSet.has(relPath)) {
          snapshot.delete(relPath);
          index.removeByPath(relPath);
          emit('vault:fileChanged', { event: 'unlink', relativePath: relPath, selfWrite: false });
        }
      }

      // ── M6.5 — Conflict diff ─────────────────────────────────────────────
      if (scanConflicts) {
        try {
          const currentConflicts = await scanConflicts();
          const currentConflictPaths = new Set(currentConflicts.map((e) => e.conflictRelPath));

          // Newly appeared conflict files.
          for (const { conflictRelPath, record } of currentConflicts) {
            if (!conflictSnapshot.has(conflictRelPath)) {
              conflictSnapshot.set(conflictRelPath, record);
              emit('vault:conflictDetected', record);
            }
          }

          // Disappeared conflict files.
          for (const conflictRelPath of conflictSnapshot.keys()) {
            if (!currentConflictPaths.has(conflictRelPath)) {
              conflictSnapshot.delete(conflictRelPath);
              emit('vault:conflictRemoved', conflictRelPath);
            }
          }
        } catch {
          // Non-fatal — try again next poll.
        }
      }
    } finally {
      polling = false;
    }
  }

  // ── Interval helpers ─────────────────────────────────────────────────────
  function startInterval(): void {
    if (timer) return;
    timer = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
  }

  function stopInterval(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  // ── Foreground gating ─────────────────────────────────────────────────────
  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      void poll(); // immediate catch-up for edits made while backgrounded
      startInterval();
    } else {
      stopInterval();
    }
  }).then((handle) => {
    appStateHandle = handle;
  });

  // Start polling right away (app is foregrounded at vault-open time).
  startInterval();

  // ── Public handle ─────────────────────────────────────────────────────────
  return {
    close(): void {
      stopInterval();
      void appStateHandle?.remove();
    },
  };
}

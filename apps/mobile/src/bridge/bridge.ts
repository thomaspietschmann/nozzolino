import { Capacitor } from '@capacitor/core';
import {
  buildVaultIndex,
  writeNote,
  createNote,
  renameNote,
  updateFrontmatter,
  deleteNote,
  saveImage,
  resolveConflict,
  createConflictFromExternal,
  scanExistingConflicts,
  type VaultIndex,
  type VaultOpsContext,
  type VaultFS,
} from '@notes-app/vault';
import type { NoteRecord, SyncSettings, SyncStatus } from '@notes-app/common';
import { sha1Hex, sha256Hex16 } from '@notes-app/common';
import { SyncClient, SyncEngine, InMemoryEtagCache } from '@notes-app/sync';
import type { SyncFS } from '@notes-app/sync';
import { WebVaultFS } from '../fs/WebVaultFS.js';
import { CapacitorVaultFS, NativeVaultPlugin } from '../fs/CapacitorVaultFS.js';
import { watchVaultByPoll, type CapacitorWatcher } from '../fs/CapacitorWatcher.js';

interface FileChangedEvent {
  event: 'add' | 'change' | 'unlink';
  relativePath: string;
  record?: NoteRecord;
  selfWrite?: boolean;
}

// ---------------------------------------------------------------------------
// Demo seed content (shown on first boot in the browser dev build only)
// ---------------------------------------------------------------------------

const now = new Date().toISOString();

const DEMO_NOTES: Record<string, string> = {
  'Welcome.md': `---
id: demo-welcome
tags: []
created: "${now}"
modified: "${now}"
---
# Welcome

This is your personal notes vault. Everything you write is stored in your browser's IndexedDB and persists across reloads.

## Getting started

- Press **⌘K / Ctrl+K** to open the command palette
- Press **?** to see all keyboard shortcuts
- Try creating a new note with the **+** button in the sidebar

## Links between notes

You can link notes using \`[[\` syntax. For example:
- Check out [[Ideas]] for inspiration
- See [[Tasks]] for what's next

Hover over a link to peek at the note. Click an unresolved link to create it.
`,
  'Ideas.md': `---
id: demo-ideas
tags: [inspiration]
created: "${now}"
modified: "${now}"
---
# Ideas

A place to collect ideas before they disappear.

- Build a [[Tasks]] tracker inside these notes
- Explore the graph view (⌘G) to see how notes connect
- Use \`#tags\` in the frontmatter panel to organise notes by topic
`,
  'Tasks.md': `---
id: demo-tasks
tags: [productivity]
created: "${now}"
modified: "${now}"
---
# Tasks

Things to do:

- [ ] Explore the [[Welcome]] note
- [ ] Create a note about your current project
- [ ] Try the graph view (⌘G / Ctrl+G)
- [ ] Check out the backlinks panel on any note

**Tip:** Use the command palette (⌘K) to search across all notes.
`,
  'Shortcuts.md': `---
id: demo-shortcuts
tags: [help]
created: "${now}"
modified: "${now}"
---
# Shortcuts

See the full list by pressing **?** anywhere outside the editor.

## Essential shortcuts

| Action | Shortcut |
|--------|----------|
| Command palette | ⌘K / Ctrl+K |
| Graph view | ⌘G / Ctrl+G |
| All shortcuts | ? |
| Bold | ⌘B |
| Italic | ⌘I |

This note is linked from [[Welcome]].
`,
};

// ---------------------------------------------------------------------------
// Module state (mirrors vaultManager.ts structure)
// ---------------------------------------------------------------------------

let vaultFS: VaultFS | null = null;
let index: VaultIndex | null = null;
/** Active poll watcher (native only). Closed and replaced on each vault:open. */
let watcher: CapacitorWatcher | null = null;
/**
 * Self-write SHA-1 registry — mirrors vaultManager.ts `selfWriteHashes`.
 * Populated by VaultOpsContext.onDidWrite; read by CapacitorWatcher to
 * suppress echoes of the app's own mutations.
 */
const selfWriteHashes = new Map<string, string>();

// Registered event handlers: channel → Set of handler functions
const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

function emit(channel: string, payload: unknown): void {
  const handlers = listeners.get(channel);
  if (!handlers) return;
  for (const h of handlers) {
    h(payload);
  }
}

function getCtx(): VaultOpsContext {
  if (!vaultFS || !index) throw new Error('Vault not open');
  return {
    vaultFS,
    index,
    generateId: () => crypto.randomUUID(),
    // Record a SHA-1 of every app write so CapacitorWatcher can distinguish
    // own echoes from real external changes (e.g. Syncthing).
    onDidWrite: (relPath: string, content: string) => {
      selfWriteHashes.set(relPath, sha1Hex(content));
    },
  };
}

/**
 * After each mutating operation, synthesize a vault:fileChanged event so
 * AppShell keeps the sidebar / index in sync — same contract as the desktop.
 */
async function synthesizeChanged(
  relativePath: string,
  event: 'add' | 'change',
  record: NoteRecord,
): Promise<void> {
  const payload: FileChangedEvent = { event, relativePath, record, selfWrite: true };
  emit('vault:fileChanged', payload);
}

// ---------------------------------------------------------------------------
// Sync — server mode (M7), mirrors the desktop syncManager
// ---------------------------------------------------------------------------

const SYNC_CONFIG_KEY = 'notes-app:syncConfig';
const ETAG_CACHE_KEY = 'notes-app:etagCache';
const MOBILE_POLL_INTERVAL_MS = 120_000;

let syncEngine: SyncEngine | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;

function readSyncConfig(): SyncSettings {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    if (raw) return JSON.parse(raw) as SyncSettings;
  } catch {
    /* ignore */
  }
  return { syncMode: 'syncthing' };
}

function writeSyncConfig(config: SyncSettings): void {
  try {
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}

/** localStorage-backed ETag cache so server state survives app restarts. */
class LocalStorageEtagCache extends InMemoryEtagCache {
  override async load(): Promise<void> {
    try {
      const raw = localStorage.getItem(ETAG_CACHE_KEY);
      this.fromJSON(raw ? (JSON.parse(raw) as Record<string, string>) : {});
    } catch {
      this.fromJSON({});
    }
  }
  override async persist(): Promise<void> {
    try {
      localStorage.setItem(ETAG_CACHE_KEY, JSON.stringify(this.toJSON()));
    } catch {
      /* ignore */
    }
  }
}

function stopMobileSync(): void {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = null;
  syncEngine = null;
}

function startMobileSync(config: SyncSettings): void {
  stopMobileSync();
  if (config.syncMode !== 'server' || !config.serverUrl || !config.syncToken) return;
  if (!vaultFS || !index) return;

  const liveFS = vaultFS;
  const liveIndex = index;
  const client = new SyncClient(config.serverUrl, config.syncToken);

  const fs: SyncFS = {
    readFile: (p) => liveFS.readFile(p),
    writeFile: async (p, c) => {
      selfWriteHashes.set(p, sha1Hex(c));
      await liveFS.writeFile(p, c);
    },
    deleteFile: (p) => liveFS.deleteFile(p),
    listDirectory: (p) => liveFS.listDirectory(p),
    exists: (p) => liveFS.exists(p),
    stat: (p) => liveFS.stat(p),
    readBinaryFile: (p) => liveFS.readBinaryFile(p),
    writeBinaryFile: async (p, b64) => {
      // Skip the self-write hash for binaries: the poll watcher reads files as
      // UTF-8 and sha1s them, which can never match a base64 attribution. A
      // spurious echo on a binary is harmless (next pass no-ops on equal etag).
      await liveFS.writeBinaryFile(p, b64);
    },
  };

  syncEngine = new SyncEngine({
    client,
    fs,
    cache: new LocalStorageEtagCache(),
    hash: sha256Hex16,
    onStatus: (status: SyncStatus) => emit('sync:statusChanged', status),
    onConflict: async (path, serverContent) => {
      const record = await createConflictFromExternal(getCtx(), path, new Date().toISOString());
      selfWriteHashes.set(path, sha1Hex(serverContent));
      await liveFS.writeFile(path, serverContent);
      const rec = await liveIndex.addOrRefresh(liveFS, path);
      emit('vault:conflictDetected', record);
      emit('vault:fileChanged', { event: 'change', relativePath: path, record: rec, selfWrite: true });
    },
    onLocalWrite: async (path) => {
      const rec = await liveIndex.addOrRefresh(liveFS, path);
      emit('vault:fileChanged', { event: 'change', relativePath: path, record: rec, selfWrite: true });
    },
    onLocalDelete: async (path) => {
      liveIndex.removeByPath(path);
      emit('vault:fileDeleted', path);
    },
  });

  void syncEngine.syncOnce();
  syncTimer = setInterval(() => {
    void syncEngine?.syncOnce();
  }, MOBILE_POLL_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Dispatch table
// ---------------------------------------------------------------------------

async function dispatch(channel: string, args: unknown[]): Promise<unknown> {
  switch (channel) {
    // -----------------------------------------------------------------------
    case 'vault:open': {
      const isNative = Capacitor.isNativePlatform();

      if (isNative) {
        // Native path: open the SAF vault
        const capFS = new CapacitorVaultFS();
        const uriArg = args[0] as string | undefined;

        if (uriArg && uriArg !== 'default') {
          // Opening a specific URI (from getRecent click or auto-open)
          await NativeVaultPlugin.setRoot({ uri: uriArg });
        } else {
          // Load previously saved URI (returning user)
          await capFS.open();
        }
        vaultFS = capFS;
      } else {
        // Browser/web path: IndexedDB + demo seed
        const dbName = (args[0] as string | undefined) ?? 'notes-vault';
        const webFS = new WebVaultFS(dbName);
        await webFS.open();
        if (await webFS.isEmpty()) {
          await webFS.seed(DEMO_NOTES);
        }
        vaultFS = webFS;
      }

      index = await buildVaultIndex(vaultFS);

      // (Re-)start the poll watcher on native only.
      // Close any previous watcher and clear the self-write registry first.
      if (watcher) { watcher.close(); watcher = null; }
      selfWriteHashes.clear();

      if (Capacitor.isNativePlatform()) {
        // M6.5.1 — emit any conflict files that already exist in the vault.
        for (const { record } of await scanExistingConflicts(getCtx())) {
          emit('vault:conflictDetected', record);
        }

        // M6.5.2 — start the poll watcher; inject a scanConflicts thunk so
        // the watcher can diff conflicts each tick without importing vault ops.
        watcher = watchVaultByPoll(
          vaultFS,
          index,
          emit,
          selfWriteHashes,
          () => scanExistingConflicts(getCtx()),
        );
      }

      // Start server-mode sync if configured (no-op for syncthing/none).
      startMobileSync(readSyncConfig());

      return index.getAllNotes();
    }

    // -----------------------------------------------------------------------
    case 'vault:getRecent': {
      if (Capacitor.isNativePlatform()) {
        try {
          const { uri } = await NativeVaultPlugin.getSavedFolder();
          if (uri) {
            return [{ path: uri, name: 'My Notes', lastOpened: new Date().toISOString() }];
          }
        } catch {
          // Permission may have been revoked; fall through to empty list
        }
        return [];
      }
      return [{ path: 'default', name: 'My Notes', lastOpened: new Date().toISOString() }];
    }

    case 'vault:getBacklinks': {
      const noteId = args[0] as string;
      return index?.getBacklinks(noteId) ?? [];
    }

    case 'vault:getRelationshipTypes': {
      return index?.getRelationshipTypes() ?? [];
    }

    // -----------------------------------------------------------------------
    case 'file:read': {
      if (!vaultFS) throw new Error('Vault not open');
      const path = args[0] as string;
      return vaultFS.readFile(path);
    }

    case 'file:write': {
      const [relPath, content] = args as [string, string];
      await writeNote(getCtx(), relPath, content);
      const record = index!.getNoteByPath(relPath);
      if (record) await synthesizeChanged(relPath, 'change', record);
      return undefined;
    }

    case 'file:create': {
      const title = args[0] as string;
      const record = await createNote(getCtx(), title);
      await synthesizeChanged(record.path, 'add', record);
      return record;
    }

    case 'file:rename': {
      const [relPath, newTitle] = args as [string, string];
      const result = await renameNote(getCtx(), relPath, newTitle);
      await synthesizeChanged(result.renamed.path, 'add', result.renamed);
      return result;
    }

    case 'file:delete': {
      const relPath = args[0] as string;
      await deleteNote(getCtx(), relPath);
      emit('vault:fileDeleted', relPath);
      return undefined;
    }

    case 'file:updateFrontmatter': {
      const [relPath, patch] = args as [string, Partial<{ tags: string[]; emoji: string | null }>];
      const record = await updateFrontmatter(getCtx(), relPath, patch);
      await synthesizeChanged(relPath, 'change', record);
      return record;
    }

    case 'image:save': {
      const [base64, ext, activePath] = args as [string, string, string];
      return saveImage(getCtx(), base64, ext, activePath);
    }

    // -----------------------------------------------------------------------
    case 'sync:resolveConflict': {
      const [notePath, conflictFilePath, mergedContent] = args as [string, string, string];
      const record = await resolveConflict(getCtx(), notePath, conflictFilePath, mergedContent);
      await synthesizeChanged(notePath, 'change', record);
      return record;
    }

    case 'sync:createConflictFromExternal': {
      const [notePath, timestamp] = args as [string, string];
      return createConflictFromExternal(getCtx(), notePath, timestamp);
    }

    // -----------------------------------------------------------------------
    case 'dialog:openFolder': {
      if (Capacitor.isNativePlatform()) {
        // Launch SAF folder picker; returns the chosen URI string
        const capFS = new CapacitorVaultFS();
        const uri = await capFS.pickFolder();
        return uri; // null if cancelled
      }
      // Browser dev build: return the fixed vault name
      return 'default';
    }

    case 'export:zip': {
      // Deferred (M6.2+): jszip in-WebView
      return null;
    }

    // -----------------------------------------------------------------------
    case 'sync:getConfig': {
      return readSyncConfig();
    }

    case 'sync:setConfig': {
      const config = args[0] as SyncSettings;
      writeSyncConfig(config);
      startMobileSync(config);
      return undefined;
    }

    case 'sync:testConnection': {
      const [url, token] = args as [string, string];
      try {
        const res = await new SyncClient(url, token).health();
        return { ok: res.ok, version: res.version };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }

    case 'sync:forceSync': {
      await syncEngine?.syncOnce();
      return undefined;
    }

    // -----------------------------------------------------------------------
    // Anytype import (M8). Desktop-first: native file picking on Android is
    // deferred, so picking is a graceful no-op (returns null → dialog idles).
    // The pure import pipeline itself is platform-neutral and ready to wire to
    // a Capacitor file picker when added.
    case 'import:anytypePick': {
      return null;
    }
    case 'import:anytypePreview':
    case 'import:anytypeRun': {
      throw new Error('Anytype import is not yet available on mobile');
    }

    default:
      console.warn(`[bridge] unhandled channel: ${channel}`);
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Public install
// ---------------------------------------------------------------------------

export function installBridge(): void {
  const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
    dispatch(channel, args) as Promise<T>;

  const on = (channel: string, handler: (...args: unknown[]) => void): (() => void) => {
    if (!listeners.has(channel)) listeners.set(channel, new Set());
    listeners.get(channel)!.add(handler);
    return () => listeners.get(channel)?.delete(handler);
  };

  // On native, e2eVaultPath is null — VaultOpenScreen handles the first-open/re-open flow.
  // On web (browser dev build), 'default' triggers the IndexedDB auto-open in App.tsx.
  const e2eVaultPath = Capacitor.isNativePlatform() ? null : 'default';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).electronAPI = {
    invoke,
    on,
    platform: Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web',
    e2eVaultPath,
  };
}

// Backward-compat alias (removed when all callers updated)
export { installBridge as installMockBridge };

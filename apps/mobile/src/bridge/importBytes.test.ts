import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { MemoryVaultFS } from '@notes-app/vault';
import type { VaultFS } from '@notes-app/vault';
import { IPC } from '@notes-app/common';

// ---------------------------------------------------------------------------
// Mocks — keep the bridge in "web" mode and back it with an in-memory vault.
// ---------------------------------------------------------------------------

// Force non-native so dispatch('vault:open') takes the browser/IndexedDB branch,
// which we redirect to a MemoryVaultFS-backed mock below.
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => 'web',
  },
  // bridge.ts calls registerPlugin('SyncPlugin') at module load; return a no-op proxy.
  registerPlugin: () => ({
    setConfig: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    forceSync: vi.fn().mockResolvedValue(undefined),
    getSyncStatus: vi.fn().mockResolvedValue({ status: 'synced' }),
    setSyncStatus: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }) },
}));

// A WebVaultFS stand-in: a MemoryVaultFS plus the open/isEmpty/seed surface the
// bridge expects on the web path. Starts empty so the bridge seeds demo notes.
class FakeWebVaultFS extends MemoryVaultFS {
  constructor(_dbName?: string) {
    super();
  }
  async open(): Promise<void> {
    /* no-op */
  }
  async isEmpty(): Promise<boolean> {
    return (await this.listDirectory('.')).length === 0;
  }
  // Bridge seeds with Record<path, content>; MemoryVaultFS.seed takes (path, content).
  override seed(arg: string | Record<string, string>, content?: string): void {
    if (typeof arg === 'string') {
      super.seed(arg, content ?? '');
      return;
    }
    for (const [path, c] of Object.entries(arg)) super.seed(path, c);
  }
}

vi.mock('../fs/WebVaultFS.js', () => ({
  WebVaultFS: FakeWebVaultFS,
}));

vi.mock('../fs/CapacitorVaultFS.js', () => ({
  CapacitorVaultFS: class {},
  NativeVaultPlugin: {},
}));

vi.mock('../fs/CapacitorWatcher.js', () => ({
  watchVaultByPoll: vi.fn(() => ({ close: vi.fn() })),
}));

const { installBridge } = await import('./bridge.js');

interface ElectronAPI {
  invoke<T>(channel: string, ...args: unknown[]): Promise<T>;
  on(channel: string, handler: (...args: unknown[]) => void): () => void;
}

function api(): ElectronAPI {
  return (globalThis as unknown as { window: { electronAPI: ElectronAPI } }).window.electronAPI;
}

/** Build a minimal Anytype-style export zip with one markdown note. */
async function buildZip(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    'Imported Note.md',
    `---\ntags:\n  - imported\ncreated: "2024-05-01T00:00:00Z"\n---\n# Imported Note\n\nBody text from Anytype.\n`,
  );
  return zip.generateAsync({ type: 'uint8array' });
}

beforeEach(() => {
  // installBridge writes to (window as any).electronAPI; provide a window object.
  (globalThis as unknown as { window: Record<string, unknown> }).window = {};
});

describe('bridge — Anytype bytes-based import', () => {
  it('previewBytes returns a summary without writing to the vault', async () => {
    installBridge();
    await api().invoke('vault:open', 'test-db');

    const bytes = await buildZip();
    const summary = await api().invoke<{ noteCount: number }>(
      IPC.IMPORT_ANYTYPE_PREVIEW_BYTES,
      bytes,
    );

    expect(summary.noteCount).toBe(1);
  });

  it('runBytes writes the imported note, emits progress, and indexes it', async () => {
    installBridge();
    await api().invoke('vault:open', 'test-db');

    const progress: { done: number; total: number }[] = [];
    api().on(IPC.IMPORT_PROGRESS, (p) => progress.push(p as { done: number; total: number }));

    // The bridge synthesizes a vault:fileChanged 'add' for each written note —
    // this only fires when the note is present in the vault index after writing.
    const added: string[] = [];
    api().on('vault:fileChanged', (e) => {
      const ev = e as { event: string; relativePath: string };
      if (ev.event === 'add') added.push(ev.relativePath);
    });

    const bytes = await buildZip();
    const summary = await api().invoke<{ noteCount: number }>(
      IPC.IMPORT_ANYTYPE_RUN_BYTES,
      bytes,
    );

    expect(summary.noteCount).toBe(1);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.at(-1)).toEqual({ done: 1, total: 1 });
    expect(added).toContain('Imported Note.md');
  });

  it('path-based preview/run still throw on mobile', async () => {
    installBridge();
    await api().invoke('vault:open', 'test-db');
    await expect(api().invoke(IPC.IMPORT_ANYTYPE_PREVIEW, '/tmp/x.zip')).rejects.toThrow();
    await expect(api().invoke(IPC.IMPORT_ANYTYPE_RUN, '/tmp/x.zip')).rejects.toThrow();
  });

  it('anytypePick returns null (no native picker)', async () => {
    installBridge();
    expect(await api().invoke(IPC.IMPORT_ANYTYPE_PICK)).toBeNull();
  });
});

// Reference VaultFS so the type import is exercised (verbatimModuleSyntax).
const _typeCheck: VaultFS | null = null;
void _typeCheck;

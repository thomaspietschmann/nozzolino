import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ConflictScanEntry } from '@notes-app/vault';
import { MemoryVaultFS, buildVaultIndex } from '@notes-app/vault';

// Mock @capacitor/app so the watcher's appStateChange listener is a no-op.
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  },
}));

// Mock @capacitor/core (imported as a type in the watcher, but vite resolves it).
vi.mock('@capacitor/core', () => ({}));

// Import after mocks are registered.
const { watchVaultByPoll } = await import('./CapacitorWatcher.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOTE_CONTENT = `---
id: test-note
tags: []
created: "2026-01-01T00:00:00.000Z"
modified: "2026-01-01T00:00:00.000Z"
---
# Test Note
`;

function makeConflictEntry(conflictRelPath: string, noteId = ''): ConflictScanEntry {
  return {
    conflictRelPath,
    record: {
      noteId,
      notePath: conflictRelPath.replace(/\.sync-conflict-[^.]+\.md$/, '.md'),
      conflictFilePath: conflictRelPath,
      detectedAt: new Date(),
    },
  };
}

/** Flush the microtask queue several times to let the async seed block settle. */
async function flushAsync(ticks = 5): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    await Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CapacitorWatcher — conflict diff (M6.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pre-seeded conflicts are NOT re-emitted on the first poll', async () => {
    const fs = new MemoryVaultFS();
    fs.seed('Note.md', NOTE_CONTENT);
    const index = await buildVaultIndex(fs);

    const CONFLICT = 'Note.sync-conflict-20260624-120000-AB12.md';
    const initialConflicts: ConflictScanEntry[] = [makeConflictEntry(CONFLICT)];
    const scanConflicts = vi.fn().mockResolvedValue(initialConflicts);

    const emitted: Array<{ channel: string; payload: unknown }> = [];
    const emit = (channel: string, payload: unknown) => emitted.push({ channel, payload });

    const watcher = watchVaultByPoll(fs, index, emit, new Map(), scanConflicts);

    // Let the async seed block complete (seeds conflictSnapshot with CONFLICT).
    await flushAsync(10);

    // Trigger a poll — CONFLICT is still present, so no new emit expected.
    vi.advanceTimersByTime(30_000);
    await flushAsync(10);

    const conflictDetected = emitted.filter((e) => e.channel === 'vault:conflictDetected');
    expect(conflictDetected).toHaveLength(0);

    watcher.close();
  });

  it('newly appeared conflict file emits vault:conflictDetected', async () => {
    const fs = new MemoryVaultFS();
    fs.seed('Note.md', NOTE_CONTENT);
    const index = await buildVaultIndex(fs);

    const NEW_CONFLICT = 'Note.sync-conflict-20260624-130000-CD34.md';

    // First call (seed): no conflicts. Second call (poll): one new conflict.
    const scanConflicts = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([makeConflictEntry(NEW_CONFLICT)]);

    const emitted: Array<{ channel: string; payload: unknown }> = [];
    const emit = (channel: string, payload: unknown) => emitted.push({ channel, payload });

    const watcher = watchVaultByPoll(fs, index, emit, new Map(), scanConflicts);
    await flushAsync(10);

    // Trigger poll — new conflict should be detected.
    vi.advanceTimersByTime(30_000);
    await flushAsync(10);

    const detected = emitted.filter((e) => e.channel === 'vault:conflictDetected');
    expect(detected).toHaveLength(1);
    expect((detected[0]!.payload as { conflictFilePath: string }).conflictFilePath).toBe(NEW_CONFLICT);

    watcher.close();
  });

  it('disappeared conflict file emits vault:conflictRemoved', async () => {
    const fs = new MemoryVaultFS();
    fs.seed('Note.md', NOTE_CONTENT);
    const index = await buildVaultIndex(fs);

    const CONFLICT = 'Note.sync-conflict-20260624-140000-EF56.md';

    // Seed with one conflict; second poll sees none → should emit removed.
    const scanConflicts = vi
      .fn()
      .mockResolvedValueOnce([makeConflictEntry(CONFLICT)])
      .mockResolvedValue([]);

    const emitted: Array<{ channel: string; payload: unknown }> = [];
    const emit = (channel: string, payload: unknown) => emitted.push({ channel, payload });

    const watcher = watchVaultByPoll(fs, index, emit, new Map(), scanConflicts);
    await flushAsync(10); // seed block runs, seeds conflictSnapshot with CONFLICT

    // First poll — CONFLICT disappears.
    vi.advanceTimersByTime(30_000);
    await flushAsync(10);

    const removed = emitted.filter((e) => e.channel === 'vault:conflictRemoved');
    expect(removed).toHaveLength(1);
    expect(removed[0]!.payload).toBe(CONFLICT);

    watcher.close();
  });

  it('watcher without scanConflicts never emits conflict channels', async () => {
    const fs = new MemoryVaultFS();
    fs.seed('Note.md', NOTE_CONTENT);
    const index = await buildVaultIndex(fs);

    const emitted: Array<{ channel: string; payload: unknown }> = [];
    const emit = (channel: string, payload: unknown) => emitted.push({ channel, payload });

    // No scanConflicts thunk — backward-compat (M6.4 callers).
    const watcher = watchVaultByPoll(fs, index, emit, new Map());
    await flushAsync(10);

    vi.advanceTimersByTime(30_000);
    await flushAsync(10);

    expect(emitted.filter((e) => e.channel.startsWith('vault:conflict'))).toHaveLength(0);

    watcher.close();
  });
});

/**
 * Store unit tests — run in jsdom (vitest.workspace.ts 'ui' entry).
 *
 * Key regression covered: the mobile bridge emits a synchronous
 * `vault:fileChanged{event:'add'}` event *before* `ipc.createFile` resolves.
 * Prior to the fix, this caused the new note to appear twice in the list
 * (once from the event handler's upsertNoteRecord, once from the bedingungsloser
 * append in createNote). A subsequent edit triggered a third entry.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NoteRecord } from '@notes-app/common';

// ─── Minimal electronAPI mock ─────────────────────────────────────────────────

type Handler = (...args: unknown[]) => void;

/** Registered `on` listeners, keyed by IPC channel. */
const listeners = new Map<string, Set<Handler>>();

/** Emit to all registered handlers for a channel (synchronous — mirrors mobile bridge). */
function emit(channel: string, payload: unknown): void {
  for (const h of listeners.get(channel) ?? []) h(payload);
}

const mockInvoke = vi.fn<[string, ...unknown[]], Promise<unknown>>();
const mockOn = vi.fn((channel: string, handler: Handler) => {
  if (!listeners.has(channel)) listeners.set(channel, new Set());
  listeners.get(channel)!.add(handler);
  return () => listeners.get(channel)?.delete(handler);
});

// Install mock before any store import so `ipc` picks it up.
(globalThis as unknown as Record<string, unknown>).window = {
  electronAPI: { invoke: mockInvoke, on: mockOn, platform: 'web', e2eVaultPath: null },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
  innerWidth: 1024,
  addEventListener: () => {},
  removeEventListener: () => {},
};

// ─── Import store AFTER window mock is installed ──────────────────────────────

const { useStore } = await import('./store.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FRONTMATTER = (id: string, _path: string) =>
  `---\nid: ${id}\ntags: []\ncreated: "2026-01-01T00:00:00.000Z"\nmodified: "2026-01-01T00:00:00.000Z"\n---\n# Test\n`;

function makeRecord(id: string, path: string): NoteRecord {
  return {
    id,
    path,
    title: 'Test',
    bodyText: 'Test',
    tags: [],
    created: new Date('2026-01-01'),
    modified: new Date('2026-01-01'),
    emoji: null,
    outboundLinks: [],
  };
}

function getState() {
  return useStore.getState();
}

beforeEach(() => {
  listeners.clear();
  mockInvoke.mockReset();
  mockOn.mockReset();
  mockOn.mockImplementation((channel: string, handler: Handler) => {
    if (!listeners.has(channel)) listeners.set(channel, new Set());
    listeners.get(channel)!.add(handler);
    return () => listeners.get(channel)?.delete(handler);
  });
  // Reset the store to a clean state.
  useStore.setState({
    notes: [],
    activeNoteId: null,
    activeNoteContent: null,
    isDirty: false,
    vaultRoot: null,
  });
});

// ─── upsertNoteRecord (unit) ───────────────────────────────────────────────────

describe('upsertNoteRecord', () => {
  it('appends a new record to an empty list', () => {
    const rec = makeRecord('id-1', 'Note.md');
    getState().upsertNoteRecord(rec);
    expect(getState().notes).toHaveLength(1);
    expect(getState().notes[0]).toEqual(rec);
  });

  it('replaces by id — same id, different path (dedup)', () => {
    const rec1 = makeRecord('id-1', 'NoteA.md');
    const rec2 = makeRecord('id-1', 'NoteB.md'); // renamed
    getState().upsertNoteRecord(rec1);
    getState().upsertNoteRecord(rec2);
    expect(getState().notes).toHaveLength(1);
    expect(getState().notes[0].path).toBe('NoteB.md');
  });

  it('replaces by path — same path, different id (should not happen but is self-healing)', () => {
    const rec1 = makeRecord('id-a', 'Note.md');
    const rec2 = makeRecord('id-b', 'Note.md'); // same file, id mismatch
    getState().upsertNoteRecord(rec1);
    getState().upsertNoteRecord(rec2);
    expect(getState().notes).toHaveLength(1);
    expect(getState().notes[0].id).toBe('id-b');
  });

  it('self-heals existing duplicates: two entries with same id → collapsed to one', () => {
    // Manually inject a duplicate (as the old bug would produce).
    const rec = makeRecord('id-dup', 'Note.md');
    useStore.setState({ notes: [rec, { ...rec, title: 'Old' }] });
    expect(getState().notes).toHaveLength(2); // pre-condition: broken state

    getState().upsertNoteRecord(rec);
    expect(getState().notes).toHaveLength(1);
  });

  it('preserves other unrelated records', () => {
    const a = makeRecord('id-a', 'A.md');
    const b = makeRecord('id-b', 'B.md');
    const bUpdated = makeRecord('id-b', 'B-renamed.md');
    useStore.setState({ notes: [a, b] });
    getState().upsertNoteRecord(bUpdated);
    expect(getState().notes).toHaveLength(2);
    expect(getState().notes.find((n) => n.id === 'id-a')).toBeDefined();
    expect(getState().notes.find((n) => n.id === 'id-b')?.path).toBe('B-renamed.md');
  });
});

// ─── createNote — mobile bridge race (the actual bug) ─────────────────────────

describe('createNote — mobile bridge synchronous event race', () => {
  it('results in exactly 1 entry even when vault:fileChanged{add} fires synchronously before createFile resolves', async () => {
    const rec = makeRecord('id-new', 'New Note.md');
    const raw = FRONTMATTER('id-new', 'New Note.md');

    // Simulate the mobile bridge: emit vault:fileChanged{add} SYNCHRONOUSLY
    // inside the invoke('file:create') handler, before the promise resolves.
    mockInvoke.mockImplementation(async (channel: string) => {
      if (channel === 'file:create') {
        // Bridge emits synchronously right here, before we return.
        emit('vault:fileChanged', { event: 'add', relativePath: 'New Note.md', record: rec, selfWrite: true });
        return rec;
      }
      if (channel === 'file:read') return raw;
      return undefined;
    });

    // Simulate AppShell registering the fileChanged listener.
    const offChanged = getState().notes; // just ensure store is accessed
    void offChanged;
    // Manually wire a listener that mirrors AppShell.tsx:54-62.
    const unsubscribe = mockOn.getMockImplementation()!('vault:fileChanged', (event: unknown) => {
      const e = event as { event: string; record?: NoteRecord };
      if (e.event !== 'unlink' && e.record) {
        getState().upsertNoteRecord(e.record);
      }
    });

    await getState().createNote('New Note');

    expect(getState().notes).toHaveLength(1);
    expect(getState().notes[0].id).toBe('id-new');
    expect(getState().activeNoteId).toBe('id-new');

    unsubscribe();
  });

  it('after subsequent saveNote (file:write + change event), still exactly 1 entry', async () => {
    const rec = makeRecord('id-edit', 'Edit.md');
    const raw = FRONTMATTER('id-edit', 'Edit.md');

    mockInvoke.mockImplementation(async (channel: string) => {
      if (channel === 'file:create') {
        emit('vault:fileChanged', { event: 'add', relativePath: 'Edit.md', record: rec, selfWrite: true });
        return rec;
      }
      if (channel === 'file:read') return raw;
      if (channel === 'file:write') {
        // Bridge emits change event synchronously (mobile behaviour).
        emit('vault:fileChanged', { event: 'change', relativePath: 'Edit.md', record: rec, selfWrite: true });
        return undefined;
      }
      return undefined;
    });

    const unsubscribe = mockOn.getMockImplementation()!('vault:fileChanged', (event: unknown) => {
      const e = event as { event: string; record?: NoteRecord; relativePath: string };
      if (e.event === 'unlink') {
        getState().removeNoteRecord(e.relativePath);
      } else if (e.record) {
        getState().upsertNoteRecord(e.record);
      }
    });

    await getState().createNote('Edit');
    expect(getState().notes).toHaveLength(1);

    // Simulate edit + autosave.
    useStore.setState({ isDirty: true });
    await getState().saveNote('# Edit\n\nsome new body');

    expect(getState().notes).toHaveLength(1);

    unsubscribe();
  });
});

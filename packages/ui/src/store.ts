import { create } from 'zustand';
import type { NoteRecord, AccentPresetKey, SyncStatus, ConflictRecord } from '@notes-app/common';
import { ACCENT_PRESETS, SEARCH_DEBOUNCE_MS, parseFrontmatter } from '@notes-app/common';
import { buildIndex, search, filterByTags } from '@notes-app/search';
import type { SearchIndex } from '@notes-app/search';
import type { SearchResult } from '@notes-app/common';
import { ipc } from './ipc.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppState {
  // Vault
  vaultRoot: string | null;
  notes: NoteRecord[];
  /** Distinct relationship types used across the vault — for autocomplete. */
  relationshipTypes: string[];
  activeNoteId: string | null;
  activeNoteContent: string | null;
  isDirty: boolean;

  // UI
  sidebarOpen: boolean;
  theme: 'dark' | 'light';
  accent: AccentPresetKey;
  showFrontmatterPanel: boolean;

  // Search / palette
  searchOpen: boolean;
  searchQuery: string;
  selectedTags: string[];
  /**
   * After navigating to a note via search, this holds the query term so
   * NoteEditor can scroll to the first match after remounting.
   */
  pendingScrollTerm: string | null;

  // Graph
  graphOpen: boolean;

  // Help overlay
  helpOpen: boolean;

  // Sync
  syncStatus: SyncStatus;
  conflicts: ConflictRecord[];
  activeConflict: ConflictRecord | null;
  showConflictsPanel: boolean;

  // Actions — vault / notes
  openVault: (path: string) => Promise<void>;
  selectNote: (id: string) => Promise<void>;
  saveNote: (content: string) => Promise<void>;
  createNote: (title: string) => Promise<void>;
  renameNote: (id: string, newTitle: string) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  setDirty: (dirty: boolean) => void;
  setActiveNoteContent: (content: string) => void;
  setSyncStatus: (status: SyncStatus) => void;
  addConflict: (record: ConflictRecord) => void;
  removeConflict: (conflictFilePath: string) => void;
  setActiveConflict: (conflict: ConflictRecord | null) => void;
  toggleConflictsPanel: () => void;
  resolveConflict: (conflict: ConflictRecord, mergedContent: string) => Promise<void>;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setAccent: (accent: AccentPresetKey) => void;
  setTags: (noteId: string, tags: string[]) => Promise<void>;
  toggleFrontmatterPanel: () => void;
  upsertNoteRecord: (record: NoteRecord) => void;
  removeNoteRecord: (relativePath: string) => void;

  // Actions — graph
  toggleGraph: () => void;
  setGraphOpen: (open: boolean) => void;

  // Actions — help overlay
  toggleHelp: () => void;
  setHelpOpen: (open: boolean) => void;

  // Actions — search / palette
  toggleSearch: () => void;
  setSearchOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  toggleSelectedTag: (tag: string) => void;
  clearSearch: () => void;
  setPendingScrollTerm: (term: string | null) => void;
  /** Run a search against the current index. Returns [] when index is not ready. */
  runSearch: (query: string) => SearchResult[];
  /** Return notes matching the selected tag filter (AND logic). */
  getTagFilteredNotes: () => NoteRecord[];

  // Imperative handle — registered by NoteEditor so setTags can flush before write
  registerEditorFlush: (fn: (() => Promise<void>) | null) => void;
}

// ─── Module-level search index singleton (not in Zustand — not serializable) ──

let searchIdx: SearchIndex | null = null;
let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
/** Imperative flush registered by NoteEditor. */
let editorFlush: (() => Promise<void>) | null = null;

// ─── Store ────────────────────────────────────────────────────────────────────

const savedTheme = (localStorage.getItem('theme') as 'dark' | 'light' | null) ?? 'dark';
const savedAccent = (localStorage.getItem('accent') as AccentPresetKey | null) ?? 'indigo';

export const useStore = create<AppState>((set, get) => ({
  vaultRoot: null,
  notes: [],
  relationshipTypes: [],
  activeNoteId: null,
  activeNoteContent: null,
  isDirty: false,
  sidebarOpen: true,
  theme: savedTheme,
  accent: savedAccent,
  showFrontmatterPanel: false,
  syncStatus: 'synced',
  conflicts: [],
  activeConflict: null,
  showConflictsPanel: false,

  // Search / palette initial state
  searchOpen: false,
  searchQuery: '',
  selectedTags: [],
  pendingScrollTerm: null,

  // Graph initial state
  graphOpen: false,

  // Help overlay initial state
  helpOpen: false,

  async openVault(path: string) {
    const records = await ipc.openVault(path);
    const relTypes = await ipc.getRelationshipTypes();
    // Build the search index immediately on vault open
    searchIdx = buildIndex(records);
    set({
      vaultRoot: path,
      notes: records,
      relationshipTypes: relTypes,
      activeNoteId: null,
      activeNoteContent: null,
      searchQuery: '',
      selectedTags: [],
    });
  },

  async selectNote(id: string) {
    const { notes, isDirty, activeNoteId, activeNoteContent } = get();

    // Auto-save previous note if dirty
    if (isDirty && activeNoteId && activeNoteContent !== null) {
      await get().saveNote(activeNoteContent);
    }

    const note = notes.find((n) => n.id === id);
    if (!note) return;

    // Store only the body — the editor must never see the YAML frontmatter block,
    // because prosemirror-markdown has no YAML awareness and would mangle it on save.
    const raw = await ipc.readFile(note.path);
    const { body } = parseFrontmatter(raw);
    set({ activeNoteId: id, activeNoteContent: body, isDirty: false });
  },

  async saveNote(content: string) {
    const { notes, activeNoteId } = get();
    const note = notes.find((n) => n.id === activeNoteId);
    if (!note) return;

    await ipc.writeFile(note.path, content);
    set({ activeNoteContent: content, isDirty: false });
  },

  async createNote(title: string) {
    const record = await ipc.createFile(title);
    // Read body only — same contract as selectNote.
    const raw = await ipc.readFile(record.path);
    const { body } = parseFrontmatter(raw);
    set((s) => ({ notes: [...s.notes, record], activeNoteId: record.id, activeNoteContent: body, isDirty: false }));
  },

  async renameNote(id: string, newTitle: string) {
    const { notes } = get();
    const note = notes.find((n) => n.id === id);
    if (!note) return;

    const { renamed, propagated } = await ipc.renameFile(note.path, newTitle);
    set((s) => {
      // Build a map of path → updated record for the propagated notes.
      const propagatedByPath = new Map(propagated.map((r) => [r.path, r]));
      return {
        notes: s.notes.map((n) => {
          if (n.id === id) return renamed;
          return propagatedByPath.get(n.path) ?? n;
        }),
      };
    });
  },

  async deleteNote(id: string) {
    const { notes, activeNoteId } = get();
    const note = notes.find((n) => n.id === id);
    if (!note) return;

    await ipc.deleteFile(note.path);
    set((s) => ({
      notes: s.notes.filter((n) => n.id !== id),
      activeNoteId: s.activeNoteId === id ? null : s.activeNoteId,
      activeNoteContent: s.activeNoteId === id ? null : s.activeNoteContent,
    }));
    void activeNoteId; // used above
  },

  setDirty(dirty: boolean) {
    set({ isDirty: dirty });
  },

  setActiveNoteContent(content: string) {
    set({ activeNoteContent: content });
  },

  setSyncStatus(status: SyncStatus) {
    set({ syncStatus: status });
  },

  addConflict(record: ConflictRecord) {
    set((s) => {
      // Dedupe by conflictFilePath
      const exists = s.conflicts.some((c) => c.conflictFilePath === record.conflictFilePath);
      const conflicts = exists ? s.conflicts : [...s.conflicts, record];
      return { conflicts, syncStatus: 'error' };
    });
  },

  removeConflict(conflictFilePath: string) {
    set((s) => {
      const conflicts = s.conflicts.filter((c) => c.conflictFilePath !== conflictFilePath);
      return {
        conflicts,
        activeConflict:
          s.activeConflict?.conflictFilePath === conflictFilePath ? null : s.activeConflict,
        syncStatus: conflicts.length === 0 ? 'synced' : 'error',
      };
    });
  },

  setActiveConflict(conflict: ConflictRecord | null) {
    set({ activeConflict: conflict });
  },

  toggleConflictsPanel() {
    set((s) => ({ showConflictsPanel: !s.showConflictsPanel }));
  },

  async resolveConflict(conflict: ConflictRecord, mergedContent: string) {
    const { activeNoteId, notes } = get();
    set({ syncStatus: 'syncing' });
    const updatedRecord = await ipc.resolveConflict(
      conflict.notePath,
      conflict.conflictFilePath,
      mergedContent,
    );
    get().upsertNoteRecord(updatedRecord);
    get().removeConflict(conflict.conflictFilePath);
    // If the resolved note is currently open, push the merged content into the editor
    const activeNote = notes.find((n) => n.id === activeNoteId);
    if (activeNote?.path === conflict.notePath) {
      const { body } = parseFrontmatter(mergedContent);
      get().setActiveNoteContent(body);
    }
    set({ activeConflict: null });
  },

  setSidebarOpen(open: boolean) {
    set({ sidebarOpen: open });
  },

  setTheme(theme: 'dark' | 'light') {
    localStorage.setItem('theme', theme);
    set({ theme });
  },

  setAccent(accent: AccentPresetKey) {
    localStorage.setItem('accent', accent);
    set({ accent });
  },

  async setTags(noteId: string, tags: string[]) {
    const { notes } = get();
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    // V1 fix: flush the editor's pending autosave first so the disk body is up
    // to date before updateFrontmatter reads it back.
    if (editorFlush) await editorFlush();

    const updated = await ipc.updateFrontmatter(note.path, { tags });
    get().upsertNoteRecord(updated);
  },

  toggleFrontmatterPanel() {
    set((s) => ({ showFrontmatterPanel: !s.showFrontmatterPanel }));
  },

  upsertNoteRecord(record: NoteRecord) {
    set((s) => {
      const exists = s.notes.some((n) => n.id === record.id || n.path === record.path);
      return {
        notes: exists
          ? s.notes.map((n) => (n.id === record.id || n.path === record.path ? record : n))
          : [...s.notes, record],
      };
    });
  },

  removeNoteRecord(relativePath: string) {
    set((s) => ({
      notes: s.notes.filter((n) => n.path !== relativePath),
    }));
  },

  // ─── Graph ─────────────────────────────────────────────────────────────────

  toggleGraph() {
    set((s) => ({ graphOpen: !s.graphOpen }));
  },

  setGraphOpen(open: boolean) {
    set({ graphOpen: open });
  },

  // ─── Help overlay ──────────────────────────────────────────────────────────

  toggleHelp() {
    set((s) => ({ helpOpen: !s.helpOpen }));
  },

  setHelpOpen(open: boolean) {
    set({ helpOpen: open });
  },

  // ─── Search / palette ───────────────────────────────────────────────────────

  toggleSearch() {
    set((s) => ({ searchOpen: !s.searchOpen, searchQuery: s.searchOpen ? '' : s.searchQuery }));
  },

  setSearchOpen(open: boolean) {
    set({ searchOpen: open });
    if (!open) set({ searchQuery: '' });
  },

  setSearchQuery(query: string) {
    set({ searchQuery: query });
  },

  toggleSelectedTag(tag: string) {
    set((s) => ({
      selectedTags: s.selectedTags.includes(tag)
        ? s.selectedTags.filter((t) => t !== tag)
        : [...s.selectedTags, tag],
    }));
  },

  clearSearch() {
    set({ searchOpen: false, searchQuery: '', selectedTags: [] });
  },

  setPendingScrollTerm(term: string | null) {
    set({ pendingScrollTerm: term });
  },

  runSearch(query: string): SearchResult[] {
    if (!searchIdx) return [];
    const { notes, selectedTags } = get();
    const results = search(searchIdx, query);
    if (selectedTags.length === 0) return results;
    // Intersect with tag filter
    const tagMatchIds = new Set(filterByTags(notes, selectedTags).map((n) => n.id));
    return results.filter((r) => tagMatchIds.has(r.noteId));
  },

  getTagFilteredNotes(): NoteRecord[] {
    const { notes, selectedTags } = get();
    return filterByTags(notes, selectedTags);
  },

  // ─── Imperative handle ─────────────────────────────────────────────────────

  registerEditorFlush(fn: (() => Promise<void>) | null) {
    editorFlush = fn;
  },
}));

// ─── Search index rebuild — subscribe to notes changes ─────────────────────────

useStore.subscribe((state, prev) => {
  if (state.notes === prev.notes) return;
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    searchIdx = buildIndex(state.notes);
  }, SEARCH_DEBOUNCE_MS);
});

// ─── Apply accent CSS variable + theme class on store changes ──────────────────

useStore.subscribe((state) => {
  const preset = ACCENT_PRESETS.find((p) => p.key === state.accent);
  if (preset) {
    const hex = preset.value;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    document.documentElement.style.setProperty('--accent', `${r} ${g} ${b}`);
  }
  document.documentElement.classList.toggle('dark', state.theme === 'dark');
});

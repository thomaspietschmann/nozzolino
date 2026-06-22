import { create } from 'zustand';
import type { NoteRecord, AccentPresetKey, SyncStatus } from '@notes-app/common';
import { ACCENT_PRESETS } from '@notes-app/common';
import { ipc } from './ipc.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppState {
  // Vault
  vaultRoot: string | null;
  notes: NoteRecord[];
  activeNoteId: string | null;
  activeNoteContent: string | null;
  isDirty: boolean;

  // UI
  sidebarOpen: boolean;
  theme: 'dark' | 'light';
  accent: AccentPresetKey;
  showFrontmatterPanel: boolean;

  // Sync
  syncStatus: SyncStatus;

  // Actions
  openVault: (path: string) => Promise<void>;
  selectNote: (id: string) => Promise<void>;
  saveNote: (content: string) => Promise<void>;
  createNote: (title: string) => Promise<void>;
  renameNote: (id: string, newTitle: string) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  setDirty: (dirty: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setAccent: (accent: AccentPresetKey) => void;
  toggleFrontmatterPanel: () => void;
  upsertNoteRecord: (record: NoteRecord) => void;
  removeNoteRecord: (relativePath: string) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

const savedTheme = (localStorage.getItem('theme') as 'dark' | 'light' | null) ?? 'dark';
const savedAccent = (localStorage.getItem('accent') as AccentPresetKey | null) ?? 'indigo';

export const useStore = create<AppState>((set, get) => ({
  vaultRoot: null,
  notes: [],
  activeNoteId: null,
  activeNoteContent: null,
  isDirty: false,
  sidebarOpen: true,
  theme: savedTheme,
  accent: savedAccent,
  showFrontmatterPanel: false,
  syncStatus: 'synced',

  async openVault(path: string) {
    const records = await ipc.openVault(path);
    set({ vaultRoot: path, notes: records, activeNoteId: null, activeNoteContent: null });
  },

  async selectNote(id: string) {
    const { notes, isDirty, activeNoteId, activeNoteContent } = get();

    // Auto-save previous note if dirty
    if (isDirty && activeNoteId && activeNoteContent !== null) {
      await get().saveNote(activeNoteContent);
    }

    const note = notes.find((n) => n.id === id);
    if (!note) return;

    const content = await ipc.readFile(note.path);
    set({ activeNoteId: id, activeNoteContent: content, isDirty: false });
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
    set((s) => ({ notes: [...s.notes, record], activeNoteId: record.id, activeNoteContent: '', isDirty: false }));
  },

  async renameNote(id: string, newTitle: string) {
    const { notes } = get();
    const note = notes.find((n) => n.id === id);
    if (!note) return;

    const updated = await ipc.renameFile(note.path, newTitle);
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? updated : n)),
    }));
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
}));

// Apply accent CSS variable on store changes
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

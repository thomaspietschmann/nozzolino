import { useEffect } from 'react';
import { useStore } from '../store.js';
import { useEdgeSwipe } from '../hooks/useEdgeSwipe.js';
import { Sidebar } from './Sidebar.js';
import { NoteHeader } from './NoteHeader.js';
import { NoteEditor } from './NoteEditor.js';
import { FrontmatterPanel } from './FrontmatterPanel.js';
import { GraphView } from './GraphView.js';
import { WikilinkPeek } from './WikilinkPeek.js';
import { CommandPalette } from './CommandPalette.js';
import { ConflictBanner } from './ConflictBanner.js';
import { ConflictResolver } from './ConflictResolver.js';
import { ConflictsPanel } from './ConflictsPanel.js';
import { HelpOverlay } from './HelpOverlay.js';
import { ipc } from '../ipc.js';
import { parseFrontmatter } from '@notes-app/common';
import { MOD } from '../help/shortcuts.js';

export function AppShell() {
  const {
    activeNoteId,
    activeNoteContent,
    showFrontmatterPanel,
    graphOpen,
    activeConflict,
    showConflictsPanel,
    conflicts,
    notes,
    isDirty,
    upsertNoteRecord,
    removeNoteRecord,
    addConflict,
    removeConflict,
    setActiveNoteContent,
    setSyncStatus,
    toggleSearch,
    setSearchOpen,
    toggleGraph,
    toggleHelp,
    setHelpOpen,
    createNote,
    sidebarOpen,
    setSidebarOpen,
  } = useStore();

  // Edge-swipe: right-from-edge opens drawer, left swipe closes — mobile only.
  useEdgeSwipe({
    isOpen: sidebarOpen,
    onOpen: () => setSidebarOpen(true),
    onClose: () => setSidebarOpen(false),
  });

  // Subscribe to file watcher events from main process
  useEffect(() => {
    const offChanged = ipc.onFileChanged(async (event) => {
      if (event.event === 'unlink') {
        removeNoteRecord(event.relativePath);
        return;
      }
      if (event.record) {
        upsertNoteRecord(event.record);
      }

      // ADR-0010 auto-refresh for the currently open note.
      // Skip when selfWrite=true: this event echoes our own autosave, not a foreign edit.
      const activeNote = notes.find((n) => n.id === activeNoteId);
      if (event.event === 'change' && !event.selfWrite && activeNote && activeNote.path === event.relativePath) {
        if (isDirty) {
          // Case 2: local unsaved edits — save external version as conflict file
          try {
            const record = await ipc.createConflictFromExternal(
              event.relativePath,
              new Date().toISOString(),
            );
            addConflict(record);
          } catch {
            // ignore — the watcher 'add' event for the conflict file will arrive shortly
          }
        } else {
          // Case 1: no unsaved edits — silently reload editor content
          try {
            const raw = await ipc.readFile(event.relativePath);
            const { body } = parseFrontmatter(raw);
            setActiveNoteContent(body);
          } catch {
            // file may be transiently unavailable
          }
        }
      }
    });

    const offDeleted = ipc.onFileDeleted((relativePath) => {
      removeNoteRecord(relativePath);
    });

    const offConflictDetected = ipc.onConflictDetected((record) => {
      addConflict(record);
    });

    const offConflictRemoved = ipc.onConflictRemoved((conflictFilePath) => {
      removeConflict(conflictFilePath);
    });

    return () => {
      offChanged();
      offDeleted();
      offConflictDetected();
      offConflictRemoved();
    };
  }, [upsertNoteRecord, removeNoteRecord, addConflict, removeConflict, setActiveNoteContent, notes, activeNoteId, isDirty]);

  // Online/offline → sync dot
  useEffect(() => {
    const onOnline = () => setSyncStatus('synced');
    const onOffline = () => setSyncStatus('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [setSyncStatus]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        toggleSearch();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        toggleGraph();
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setHelpOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggleSearch, setSearchOpen, toggleGraph, setHelpOpen]);

  // Derive the active note's conflict record (if any)
  const activeNote = notes.find((n) => n.id === activeNoteId);
  const activeNoteConflict = activeNote
    ? conflicts.find((c) => c.notePath === activeNote.path) ?? null
    : null;

  return (
    <div className="flex h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden">
      <WikilinkPeek />
      <CommandPalette />
      <HelpOverlay />
      {activeConflict && <ConflictResolver />}

      {/* Mobile backdrop scrim — tapping it closes the drawer */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar with hamburger — hidden on desktop */}
        <div className="md:hidden flex items-center h-12 shrink-0 px-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <button
            aria-label="Open sidebar"
            data-testid="sidebar-toggle"
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xl leading-none"
          >
            ☰
          </button>
        </div>
        {activeNoteId && activeNoteContent !== null ? (
          <>
            <NoteHeader noteId={activeNoteId} />
            {activeNoteConflict && <ConflictBanner conflict={activeNoteConflict} />}
            {graphOpen ? (
              <GraphView />
            ) : (
              <div className="flex flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto">
                  <NoteEditor content={activeNoteContent} noteId={activeNoteId} />
                </div>
                {showFrontmatterPanel && <FrontmatterPanel noteId={activeNoteId} />}
                {showConflictsPanel && <ConflictsPanel />}
              </div>
            )}
          </>
        ) : (
          <EmptyState
            onNewNote={() => createNote('Untitled')}
            onPalette={toggleSearch}
            onGraph={toggleGraph}
            onHelp={toggleHelp}
          />
        )}
      </main>
    </div>
  );
}

function EmptyState({ onNewNote, onPalette, onGraph, onHelp }: {
  onNewNote: () => void;
  onPalette: () => void;
  onGraph: () => void;
  onHelp: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 text-center select-none">
      {/* Logo / icon */}
      <div className="w-16 h-16 mb-6 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-3xl shadow-inner">
        📝
      </div>

      <h1 className="text-xl font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
        Welcome to notes-app
      </h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8 max-w-sm">
        Plain Markdown files. No lock-in. Syncs with Syncthing.
      </p>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3 justify-center mb-10">
        <button
          onClick={onNewNote}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity shadow"
        >
          <span className="text-base leading-none">＋</span>
          New note
        </button>
        <button
          onClick={onPalette}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <span>🔍</span>
          Search
          <kbd className="ml-1 text-xs text-zinc-400 dark:text-zinc-600 border border-zinc-300 dark:border-zinc-700 rounded px-1">{MOD}K</kbd>
        </button>
        <button
          onClick={onGraph}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <span>🕸</span>
          Graph
          <kbd className="ml-1 text-xs text-zinc-400 dark:text-zinc-600 border border-zinc-300 dark:border-zinc-700 rounded px-1">{MOD}G</kbd>
        </button>
      </div>

      {/* Feature highlights */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-lg text-left mb-8">
        {[
          { icon: '[[', label: 'Wikilinks', desc: 'Type [[ to link notes' },
          { icon: '🏷', label: 'Tags', desc: 'Frontmatter tags + filter' },
          { icon: '#', label: 'Markdown', desc: 'Full Markdown with autoformat' },
          { icon: '🔄', label: 'Sync', desc: 'Conflict-safe Syncthing sync' },
          { icon: '🌙', label: 'Themes', desc: 'Dark & light mode + accent' },
          { icon: '🔍', label: 'Full-text search', desc: 'Instant across all notes' },
        ].map((f) => (
          <div key={f.label} className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60">
            <div className="text-lg mb-1 font-mono text-accent">{f.icon}</div>
            <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{f.label}</div>
            <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{f.desc}</div>
          </div>
        ))}
      </div>

      {/* Hint */}
      <button
        onClick={onHelp}
        className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors flex items-center gap-1"
      >
        Click <strong>⌨</strong> in the sidebar to see all keyboard shortcuts
      </button>
    </div>
  );
}

import { useEffect } from 'react';
import { useStore } from '../store.js';
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
import { ipc } from '../ipc.js';
import { parseFrontmatter } from '@notes-app/common';

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
  } = useStore();

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
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggleSearch, setSearchOpen, toggleGraph]);

  // Derive the active note's conflict record (if any)
  const activeNote = notes.find((n) => n.id === activeNoteId);
  const activeNoteConflict = activeNote
    ? conflicts.find((c) => c.notePath === activeNote.path) ?? null
    : null;

  return (
    <div className="flex h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden">
      <WikilinkPeek />
      <CommandPalette />
      {activeConflict && <ConflictResolver />}
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
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
          <EmptyState />
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500">
      <svg className="w-16 h-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="text-lg">Select a note or create a new one</p>
      <p className="text-sm mt-1">Click <strong>+</strong> in the sidebar to create your first note</p>
    </div>
  );
}

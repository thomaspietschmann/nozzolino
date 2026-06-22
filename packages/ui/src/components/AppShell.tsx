import React, { useEffect } from 'react';
import { useStore } from '../store.js';
import { Sidebar } from './Sidebar.js';
import { NoteHeader } from './NoteHeader.js';
import { NoteEditor } from './NoteEditor.js';
import { FrontmatterPanel } from './FrontmatterPanel.js';
import { ipc } from '../ipc.js';

export function AppShell() {
  const {
    activeNoteId,
    activeNoteContent,
    showFrontmatterPanel,
    upsertNoteRecord,
    removeNoteRecord,
  } = useStore();

  // Subscribe to file watcher events from main process
  useEffect(() => {
    const offChanged = ipc.onFileChanged((event) => {
      if (event.event === 'unlink') {
        removeNoteRecord(event.relativePath);
      } else if (event.record) {
        upsertNoteRecord(event.record);
      }
    });

    const offDeleted = ipc.onFileDeleted((relativePath) => {
      removeNoteRecord(relativePath);
    });

    return () => {
      offChanged();
      offDeleted();
    };
  }, [upsertNoteRecord, removeNoteRecord]);

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {activeNoteId && activeNoteContent !== null ? (
          <>
            <NoteHeader noteId={activeNoteId} />
            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto">
                <NoteEditor content={activeNoteContent} noteId={activeNoteId} />
              </div>
              {showFrontmatterPanel && <FrontmatterPanel noteId={activeNoteId} />}
            </div>
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
    <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
      <svg className="w-16 h-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="text-lg">Select a note or create a new one</p>
      <p className="text-sm mt-1">Click <strong>+</strong> in the sidebar to create your first note</p>
    </div>
  );
}

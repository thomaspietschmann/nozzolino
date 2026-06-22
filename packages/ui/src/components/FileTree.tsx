import React, { useState } from 'react';
import type { NoteRecord } from '@notes-app/common';
import { useStore } from '../store.js';

interface FileTreeProps {
  notes: NoteRecord[];
}

export function FileTree({ notes }: FileTreeProps) {
  const { activeNoteId, selectNote, deleteNote } = useStore();
  const [contextMenu, setContextMenu] = useState<{ noteId: string; x: number; y: number } | null>(null);

  const sorted = [...notes].sort((a, b) => a.title.localeCompare(b.title));

  const handleContextMenu = (e: React.MouseEvent, noteId: string) => {
    e.preventDefault();
    setContextMenu({ noteId, x: e.clientX, y: e.clientY });
  };

  const closeMenu = () => setContextMenu(null);

  return (
    <div className="flex-1 overflow-y-auto" onClick={closeMenu}>
      {sorted.length === 0 && (
        <p className="px-4 py-8 text-center text-zinc-500 text-sm">No notes yet</p>
      )}

      {sorted.map((note) => (
        <button
          key={note.id}
          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 rounded-lg mx-1 transition-colors ${
            activeNoteId === note.id
              ? 'bg-accent/20 text-white'
              : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
          }`}
          onClick={() => void selectNote(note.id)}
          onContextMenu={(e) => handleContextMenu(e, note.id)}
        >
          {note.emoji && <span className="shrink-0">{note.emoji}</span>}
          <span className="truncate flex-1">{note.title}</span>
          {note.tags.length > 0 && (
            <span className="text-xs text-zinc-600 shrink-0">
              {note.tags.length > 1 ? `${note.tags.length} tags` : note.tags[0]}
            </span>
          )}
        </button>
      ))}

      {contextMenu && (
        <ContextMenu
          noteId={contextMenu.noteId}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeMenu}
          onDelete={(id) => {
            void deleteNote(id);
            closeMenu();
          }}
        />
      )}
    </div>
  );
}

interface ContextMenuProps {
  noteId: string;
  x: number;
  y: number;
  onClose: () => void;
  onDelete: (id: string) => void;
}

function ContextMenu({ noteId, x, y, onClose, onDelete }: ContextMenuProps) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-36"
        style={{ left: x, top: y }}
      >
        <button
          className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-zinc-700 transition-colors"
          onClick={() => onDelete(noteId)}
        >
          Delete note
        </button>
      </div>
    </>
  );
}

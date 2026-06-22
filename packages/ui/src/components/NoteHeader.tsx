import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store.js';

interface NoteHeaderProps {
  noteId: string;
}

export function NoteHeader({ noteId }: NoteHeaderProps) {
  const note = useStore((s) => s.notes.find((n) => n.id === noteId));
  const { renameNote, isDirty } = useStore();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note?.title ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(note?.title ?? '');
  }, [note?.title]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = title.trim();
    if (!trimmed || trimmed === note?.title) {
      setTitle(note?.title ?? '');
      return;
    }
    void renameNote(noteId, trimmed);
  };

  if (!note) return null;

  return (
    <div className="flex items-center gap-2 px-12 pt-8 pb-2 border-b border-zinc-800">
      {note.emoji && <span className="text-2xl">{note.emoji}</span>}
      {editing ? (
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setTitle(note.title);
              setEditing(false);
            }
          }}
          className="flex-1 text-2xl font-bold bg-transparent text-zinc-100 outline-none border-b border-accent"
        />
      ) : (
        <h1
          className="flex-1 text-2xl font-bold text-zinc-100 cursor-text hover:text-white transition-colors"
          onClick={() => setEditing(true)}
        >
          {note.title}
        </h1>
      )}
      {isDirty && (
        <span className="text-xs text-zinc-500 shrink-0">unsaved</span>
      )}
    </div>
  );
}

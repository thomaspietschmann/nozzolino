import React, { useState } from 'react';
import type { NoteRecord } from '@notes-app/common';
import { useStore } from '../store.js';

interface MonthBrowserProps {
  notes: NoteRecord[];
}

/** Group notes by YYYY-MM of their `modified` date, newest month first. */
function groupByMonth(notes: NoteRecord[]): Array<{ label: string; notes: NoteRecord[] }> {
  const groups = new Map<string, NoteRecord[]>();

  for (const note of notes) {
    // Guard: modified may arrive as a serialised string over IPC
    const d = note.modified instanceof Date ? note.modified : new Date(note.modified);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(note);
    } else {
      groups.set(key, [note]);
    }
  }

  // Sort groups descending; sort notes within each group by modified desc
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, groupNotes]) => ({
      label: formatMonthLabel(key),
      notes: [...groupNotes].sort(
        (a, b) =>
          new Date(b.modified).getTime() - new Date(a.modified).getTime()
      ),
    }));
}

function formatMonthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-');
  if (!year || !month) return yyyyMM;
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
}

export function MonthBrowser({ notes }: MonthBrowserProps) {
  const { activeNoteId, selectNote } = useStore();
  const groups = groupByMonth(notes);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleGroup = (label: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  if (groups.length === 0) {
    return <p className="px-4 py-8 text-center text-zinc-500 text-sm">No notes yet</p>;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {groups.map(({ label, notes: groupNotes }) => {
        const isCollapsed = collapsed.has(label);
        return (
          <div key={label}>
            {/* Month header */}
            <button
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-300 transition-colors"
              onClick={() => toggleGroup(label)}
            >
              <span>{label}</span>
              <span className="opacity-60">{isCollapsed ? '▶' : '▼'}</span>
            </button>

            {/* Notes in this month */}
            {!isCollapsed &&
              groupNotes.map((note) => (
                <button
                  key={note.id}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 rounded-lg mx-1 transition-colors ${
                    activeNoteId === note.id
                      ? 'bg-accent/20 text-white'
                      : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                  }`}
                  style={{ width: 'calc(100% - 8px)' }}
                  onClick={() => void selectNote(note.id)}
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
          </div>
        );
      })}
    </div>
  );
}

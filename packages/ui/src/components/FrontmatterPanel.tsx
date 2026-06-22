import React, { useState, useEffect } from 'react';
import type { NoteRecord } from '@notes-app/common';
import { useStore } from '../store.js';
import { ipc } from '../ipc.js';

interface FrontmatterPanelProps {
  noteId: string;
}

export function FrontmatterPanel({ noteId }: FrontmatterPanelProps) {
  const note = useStore((s) => s.notes.find((n) => n.id === noteId));
  const { selectNote } = useStore();
  const [backlinks, setBacklinks] = useState<NoteRecord[]>([]);
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    setBacklinks([]);
    ipc.getBacklinks(noteId).then(setBacklinks).catch(() => setBacklinks([]));
  }, [noteId]);

  if (!note) return null;

  return (
    <aside className="w-64 shrink-0 border-l border-zinc-800 bg-zinc-950 p-4 overflow-y-auto text-sm">
      <h3 className="font-semibold text-zinc-400 uppercase tracking-wider text-xs mb-3">
        Frontmatter
      </h3>

      <div className="space-y-4">
        {/* UUID */}
        <div>
          <dt className="text-zinc-500 text-xs mb-1">ID</dt>
          <dd className="font-mono text-xs text-zinc-400 break-all">{note.id}</dd>
        </div>

        {/* Emoji */}
        {note.emoji && (
          <div>
            <dt className="text-zinc-500 text-xs mb-1">Emoji</dt>
            <dd className="text-xl">{note.emoji}</dd>
          </div>
        )}

        {/* Tags */}
        <div>
          <dt className="text-zinc-500 text-xs mb-1">Tags</dt>
          <dd className="flex flex-wrap gap-1">
            {note.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-xs"
              >
                {tag}
              </span>
            ))}
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTag.trim()) {
                  setNewTag('');
                }
              }}
              placeholder="Add tag…"
              className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-xs outline-none w-24 placeholder-zinc-600"
            />
          </dd>
        </div>

        {/* Outlinks */}
        {note.outlinks.length > 0 && (
          <div>
            <dt className="text-zinc-500 text-xs mb-1">
              Links to ({note.outlinks.length})
            </dt>
            <dd className="space-y-1">
              {note.outlinks.map((link, i) => (
                <div key={i} className="text-xs text-accent">
                  {link.targetTitle}
                  {link.relationshipType && (
                    <span className="text-zinc-500 ml-1">({link.relationshipType})</span>
                  )}
                </div>
              ))}
            </dd>
          </div>
        )}

        {/* Backlinks */}
        {backlinks.length > 0 && (
          <div>
            <dt className="text-zinc-500 text-xs mb-1">
              Referenced by ({backlinks.length})
            </dt>
            <dd className="space-y-1">
              {backlinks.map((bl) => (
                <button
                  key={bl.id}
                  onClick={() => void selectNote(bl.id)}
                  className="block w-full text-left text-xs text-zinc-300 hover:text-white truncate"
                >
                  {bl.emoji && <span className="mr-1">{bl.emoji}</span>}
                  {bl.title}
                </button>
              ))}
            </dd>
          </div>
        )}

        {/* Modified */}
        <div>
          <dt className="text-zinc-500 text-xs mb-1">Modified</dt>
          <dd className="text-xs text-zinc-400">
            {note.modified instanceof Date
              ? note.modified.toLocaleString()
              : new Date(note.modified).toLocaleString()}
          </dd>
        </div>
      </div>
    </aside>
  );
}

import React, { useState } from 'react';
import { useStore } from '../store.js';
import { FileTree } from './FileTree.js';
import { ACCENT_PRESETS } from '@notes-app/common';

export function Sidebar() {
  const { notes, vaultRoot, createNote, theme, accent, setTheme, setAccent, syncStatus } =
    useStore();
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [showNewNote, setShowNewNote] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const vaultName = vaultRoot ? vaultRoot.split('/').pop() ?? vaultRoot : '';

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newNoteTitle.trim();
    if (!title) return;
    void createNote(title);
    setNewNoteTitle('');
    setShowNewNote(false);
  };

  return (
    <aside className="w-60 shrink-0 flex flex-col bg-zinc-900 border-r border-zinc-800 select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <SyncDot status={syncStatus} />
          <span className="font-medium text-zinc-200 text-sm truncate">{vaultName}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            title="New note"
            onClick={() => setShowNewNote((v) => !v)}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors text-lg leading-none"
          >
            +
          </button>
          <button
            title="Settings"
            onClick={() => setShowSettings((v) => !v)}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors text-sm leading-none"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* New note input */}
      {showNewNote && (
        <form onSubmit={handleCreate} className="px-3 py-2 border-b border-zinc-800">
          <input
            autoFocus
            value={newNoteTitle}
            onChange={(e) => setNewNoteTitle(e.target.value)}
            placeholder="Note title…"
            className="w-full bg-zinc-800 text-zinc-100 text-sm rounded px-2 py-1.5 outline-none placeholder-zinc-600 focus:ring-1 ring-accent"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowNewNote(false);
            }}
          />
        </form>
      )}

      {/* File tree */}
      <FileTree notes={notes} />

      {/* Settings panel */}
      {showSettings && (
        <div className="border-t border-zinc-800 p-3 space-y-3">
          <div>
            <p className="text-xs text-zinc-500 mb-2">Theme</p>
            <div className="flex gap-2">
              <button
                onClick={() => setTheme('dark')}
                className={`flex-1 text-xs py-1 rounded border transition-colors ${
                  theme === 'dark'
                    ? 'border-accent bg-accent/20 text-white'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                }`}
              >
                Dark
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`flex-1 text-xs py-1 rounded border transition-colors ${
                  theme === 'light'
                    ? 'border-accent bg-accent/20 text-white'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                }`}
              >
                Light
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs text-zinc-500 mb-2">Accent</p>
            <div className="flex gap-1.5 flex-wrap">
              {ACCENT_PRESETS.map((p) => (
                <button
                  key={p.key}
                  title={p.name}
                  onClick={() => setAccent(p.key)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${
                    accent === p.key ? 'border-white scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: p.value }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function SyncDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    synced: 'bg-emerald-500',
    syncing: 'bg-amber-500 animate-pulse',
    error: 'bg-red-500',
    offline: 'bg-zinc-600',
  };
  return (
    <span
      className={`w-2 h-2 rounded-full shrink-0 ${colors[status] ?? colors['offline']}`}
      title={`Sync: ${status}`}
    />
  );
}

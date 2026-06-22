import React, { useState } from 'react';
import { useStore } from '../store.js';
import type { SyncStatus } from '@notes-app/common';
import { ipc } from '../ipc.js';
import { FileTree } from './FileTree.js';
import { MonthBrowser } from './MonthBrowser.js';
import { ACCENT_PRESETS } from '@notes-app/common';

// On macOS with titleBarStyle:'hiddenInset' the traffic lights (≈76px wide) sit
// at the top-left of the window and overlap the sidebar header unless we offset.
const isMacOS = typeof window !== 'undefined' && window.electronAPI?.platform === 'darwin';

export function Sidebar() {
  const { notes, vaultRoot, createNote, theme, accent, setTheme, setAccent, syncStatus, toggleConflictsPanel } =
    useStore();
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [showNewNote, setShowNewNote] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [viewMode, setViewMode] = useState<'alpha' | 'month'>('alpha');

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
    <aside className="w-60 shrink-0 flex flex-col bg-zinc-50 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 select-none">
      {/* Header — on macOS left-pad past the traffic-light buttons */}
      <div
        className={`flex items-center justify-between py-3 border-b border-zinc-200 dark:border-zinc-800 ${isMacOS ? 'pl-[80px] pr-3' : 'px-3'}`}
        style={isMacOS ? { WebkitAppRegion: 'drag' } as React.CSSProperties : undefined}
      >
        <div className="flex items-center gap-2 min-w-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <SyncDot status={syncStatus} onClick={toggleConflictsPanel} />
          <span className="font-medium text-zinc-800 dark:text-zinc-200 text-sm truncate">{vaultName}</span>
        </div>
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            title="New note"
            onClick={() => setShowNewNote((v) => !v)}
            className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors text-lg leading-none"
          >
            +
          </button>
          <button
            title={viewMode === 'alpha' ? 'Switch to by month' : 'Switch to A–Z'}
            onClick={() => setViewMode((m) => (m === 'alpha' ? 'month' : 'alpha'))}
            className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors text-sm leading-none"
          >
            {viewMode === 'alpha' ? '📅' : 'A–Z'}
          </button>
          <button
            title="Settings"
            onClick={() => setShowSettings((v) => !v)}
            className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors text-sm leading-none"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* New note input */}
      {showNewNote && (
        <form onSubmit={handleCreate} className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">
          <input
            autoFocus
            value={newNoteTitle}
            onChange={(e) => setNewNoteTitle(e.target.value)}
            placeholder="Note title…"
            className="w-full bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm rounded px-2 py-1.5 outline-none placeholder-zinc-500 dark:placeholder-zinc-600 focus:ring-1 ring-accent"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowNewNote(false);
            }}
          />
        </form>
      )}

      {/* Note list — alphabetical or by month */}
      {viewMode === 'alpha' ? <FileTree notes={notes} /> : <MonthBrowser notes={notes} />}

      {/* Settings panel */}
      {showSettings && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 p-3 space-y-3">
          <div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">Theme</p>
            <div className="flex gap-2">
              <button
                onClick={() => setTheme('dark')}
                className={`flex-1 text-xs py-1 rounded border transition-colors ${
                  theme === 'dark'
                    ? 'border-accent bg-accent/20 text-white'
                    : 'border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500'
                }`}
              >
                Dark
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`flex-1 text-xs py-1 rounded border transition-colors ${
                  theme === 'light'
                    ? 'border-accent bg-accent/20 text-white'
                    : 'border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500'
                }`}
              >
                Light
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">Accent</p>
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

          <div>
            <button
              onClick={() => void ipc.exportZip()}
              className="w-full text-xs py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            >
              ↓ Export vault to ZIP…
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

function SyncDot({ status, onClick }: { status: SyncStatus; onClick?: () => void }) {
  // ADR-0009 4-state spec:
  //   synced  → solid green
  //   syncing → solid yellow (no pulse; pulse would look like an error)
  //   error   → solid red
  //   offline → hollow red ring
  const label: Record<SyncStatus, string> = {
    synced: 'Synced',
    syncing: 'Syncing…',
    error: 'Conflict detected — click to review',
    offline: 'Offline',
  };

  if (status === 'offline') {
    return (
      <button
        type="button"
        onClick={onClick}
        title={label.offline}
        className="w-2.5 h-2.5 rounded-full shrink-0 border-2 border-red-500 bg-transparent cursor-pointer"
      />
    );
  }

  const solidColor: Record<SyncStatus, string> = {
    synced: 'bg-emerald-500',
    syncing: 'bg-amber-400',
    error: 'bg-red-500',
    offline: '',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={label[status]}
      className={`w-2 h-2 rounded-full shrink-0 cursor-pointer ${solidColor[status]}`}
    />
  );
}

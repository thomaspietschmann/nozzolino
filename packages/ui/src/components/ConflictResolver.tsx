import { useEffect, useState, useCallback } from 'react';
import { useStore } from '../store.js';
import { ipc } from '../ipc.js';
import { lineDiff } from '@notes-app/sync';
import type { DiffSegment } from '@notes-app/sync';

export function ConflictResolver() {
  const { activeConflict, notes, resolveConflict, setActiveConflict } = useStore();

  const [currentContent, setCurrentContent] = useState<string>('');
  const [conflictContent, setConflictContent] = useState<string>('');
  const [mergeText, setMergeText] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeConflict) return;
    setLoading(true);
    Promise.all([
      ipc.readFile(activeConflict.notePath),
      ipc.readFile(activeConflict.conflictFilePath),
    ])
      .then(([current, conflict]) => {
        setCurrentContent(current);
        setConflictContent(conflict);
        setMergeText(current);
      })
      .catch(() => {
        setCurrentContent('');
        setConflictContent('');
        setMergeText('');
      })
      .finally(() => setLoading(false));
  }, [activeConflict]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveConflict(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setActiveConflict]);

  const handleResolve = useCallback(async () => {
    if (!activeConflict) return;
    setSaving(true);
    try {
      await resolveConflict(activeConflict, mergeText);
    } finally {
      setSaving(false);
    }
  }, [activeConflict, mergeText, resolveConflict]);

  if (!activeConflict) return null;

  const noteTitle =
    notes.find((n) => n.path === activeConflict.notePath)?.title ??
    activeConflict.notePath;

  const segments: DiffSegment[] = loading ? [] : lineDiff(currentContent, conflictContent);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <span className="text-red-400 text-lg shrink-0">⚠</span>
        <h2 className="flex-1 font-semibold text-base truncate">
          Resolve conflict: {noteTitle}
        </h2>
        <button
          onClick={() => setActiveConflict(null)}
          className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors text-sm leading-none"
          title="Close (Escape)"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4 min-h-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-zinc-400 dark:text-zinc-500 text-sm">
            Loading…
          </div>
        ) : (
          <>
            {/* Side-by-side diff */}
            <div className="flex gap-4 min-h-0 flex-[0_0_40%]">
              <DiffColumn title="Current" segments={segments} side="current" />
              <DiffColumn title="Conflict copy" segments={segments} side="conflict" />
            </div>

            {/* Merge editor */}
            <div className="flex flex-col flex-1 min-h-0 gap-1.5">
              <label className="text-xs text-zinc-500 dark:text-zinc-400 font-medium uppercase tracking-wide shrink-0">
                Merged result — edit freely
              </label>
              <textarea
                value={mergeText}
                onChange={(e) => setMergeText(e.target.value)}
                className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded p-3 text-sm font-mono text-zinc-900 dark:text-zinc-100 resize-none focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 min-h-0"
                spellCheck={false}
              />
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
        <button
          onClick={() => setActiveConflict(null)}
          className="px-4 py-2 rounded text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleResolve()}
          disabled={saving || loading}
          className="px-4 py-2 rounded text-sm font-medium bg-emerald-700 hover:bg-emerald-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Mark as resolved'}
        </button>
      </div>
    </div>
  );
}

interface DiffColumnProps {
  title: string;
  segments: DiffSegment[];
  side: 'current' | 'conflict';
}

function DiffColumn({ title, segments, side }: DiffColumnProps) {
  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium uppercase tracking-wide mb-1 shrink-0">
        {title}
      </div>
      <div className="flex-1 overflow-auto rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 p-3 font-mono text-xs leading-5 min-h-0">
        {segments.map((seg, i) => {
          // 'added' = present in conflict, absent in current; 'removed' = opposite
          const visible =
            seg.type === 'equal' ||
            (side === 'current' && seg.type === 'removed') ||
            (side === 'conflict' && seg.type === 'added');
          if (!visible) return null;

          const cls =
            seg.type === 'equal'
              ? 'text-zinc-500 dark:text-zinc-400'
              : seg.type === 'added'
                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-300';

          return (
            <span key={i} className={cls}>
              {seg.value}
            </span>
          );
        })}
      </div>
    </div>
  );
}

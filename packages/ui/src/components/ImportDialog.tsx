import { useEffect, useRef, useState } from 'react';
import { ipc, type ImportSummary } from '../ipc.js';

type Phase = 'idle' | 'previewing' | 'preview' | 'importing' | 'done' | 'error';

const DESKTOP_PLATFORMS = ['darwin', 'linux', 'win32'];

/** Desktop uses the native file dialog (path-based); mobile/web has no dialog so
 * it reads the chosen file's bytes via a hidden <input type="file">. */
function isMobilePlatform(): boolean {
  const platform = window.electronAPI?.platform;
  return !platform || !DESKTOP_PLATFORMS.includes(platform);
}

/** Anytype import dialog: pick a .zip, preview the mapping, then run the import (M8). */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [filePath, setFilePath] = useState<string | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobile = isMobilePlatform();

  useEffect(() => {
    return ipc.onImportProgress((p) => setProgress(p));
  }, []);

  // ─── Desktop: native dialog → path ──────────────────────────────────────────
  const pick = async () => {
    const path = await ipc.pickAnytypeFile();
    if (!path) return;
    setFilePath(path);
    setPhase('previewing');
    try {
      setSummary(await ipc.previewAnytypeImport(path));
      setPhase('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  // ─── Mobile/web: hidden <input> → bytes ─────────────────────────────────────
  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so re-selecting the same file fires a fresh change event.
    e.target.value = '';
    if (!file) return;
    setPhase('previewing');
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      setBytes(buf);
      setSummary(await ipc.previewAnytypeImportBytes(buf));
      setPhase('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  };

  const run = async () => {
    setPhase('importing');
    try {
      if (mobile) {
        if (!bytes) return;
        setSummary(await ipc.runAnytypeImportBytes(bytes));
      } else {
        if (!filePath) return;
        setSummary(await ipc.runAnytypeImport(filePath));
      }
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      data-testid="import-dialog"
    >
      <div
        className="w-[28rem] max-w-[90vw] rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100 mb-3">
          Import from Anytype
        </h2>

        {phase === 'idle' && (
          <>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
              Choose an Anytype export (.zip). Relations become tags and internal links become
              wiki-links.
            </p>
            {mobile ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  data-testid="import-file-input"
                  className="hidden"
                  onChange={(e) => void onFileChange(e)}
                />
                <button
                  data-testid="import-pick"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full text-sm py-2 rounded bg-accent/20 border border-accent text-zinc-900 dark:text-white"
                >
                  Choose .zip…
                </button>
              </>
            ) : (
              <button
                data-testid="import-pick"
                onClick={() => void pick()}
                className="w-full text-sm py-2 rounded bg-accent/20 border border-accent text-zinc-900 dark:text-white"
              >
                Choose .zip…
              </button>
            )}
          </>
        )}

        {phase === 'previewing' && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Reading export…</p>
        )}

        {(phase === 'preview' || phase === 'done') && summary && (
          <div data-testid="import-summary" className="text-sm text-zinc-600 dark:text-zinc-300 space-y-1 mb-4">
            <p>
              <strong>{summary.noteCount}</strong> notes, <strong>{summary.tagCount}</strong> tags,{' '}
              <strong>{summary.linkCount}</strong> links ({summary.unresolvedLinks} unresolved)
            </p>
            {summary.attachmentCount > 0 && (
              <p className="text-xs text-zinc-400">
                {summary.attachmentCount} attachment references → files copied into the vault
              </p>
            )}
            {phase === 'done' && (
              <p data-testid="import-done" className="text-accent">
                Import complete.
              </p>
            )}
          </div>
        )}

        {phase === 'importing' && (
          <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            <p>Importing…</p>
            {progress && (
              <p data-testid="import-progress">
                {progress.done} / {progress.total}
              </p>
            )}
          </div>
        )}

        {phase === 'error' && (
          <p data-testid="import-error" className="text-sm text-rose-500 mb-4">
            Import failed: {error}
          </p>
        )}

        <div className="flex gap-2 justify-end mt-2">
          {phase === 'preview' && (
            <button
              data-testid="import-confirm"
              onClick={() => void run()}
              className="text-sm px-3 py-1.5 rounded bg-accent/20 border border-accent text-zinc-900 dark:text-white"
            >
              Import {summary?.noteCount ?? ''} notes
            </button>
          )}
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"
          >
            {phase === 'done' ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import { ipc } from '../ipc.js';
import type { RecentVault } from '../ipc.js';

export function VaultOpenScreen() {
  const { openVault } = useStore();
  const [recent, setRecent] = useState<RecentVault[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    ipc.getRecentVaults().then(setRecent).catch(() => setRecent([]));
  }, []);

  const handleOpen = async () => {
    setLoading(true);
    try {
      const folder = await ipc.openFolder();
      if (folder) await openVault(folder);
    } finally {
      setLoading(false);
    }
  };

  const handleRecent = async (path: string) => {
    setLoading(true);
    try {
      await openVault(path);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen bg-white dark:bg-zinc-950 flex flex-col items-center justify-center text-zinc-900 dark:text-zinc-100">
      <div className="w-full max-w-sm px-6">
        {/* Logo / title */}
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">📝</div>
          <h1 className="text-3xl font-bold text-white">Notes</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 text-sm">Plain Markdown, your files, your sync</p>
        </div>

        {/* Open folder */}
        <button
          onClick={() => void handleOpen()}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-accent/80 hover:bg-accent text-white font-semibold transition-colors disabled:opacity-50"
        >
          {loading ? 'Opening…' : 'Open vault folder'}
        </button>

        {/* Recent vaults */}
        {recent.length > 0 && (
          <div className="mt-8">
            <p className="text-xs text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">Recent</p>
            <div className="space-y-1">
              {recent.map((v) => (
                <button
                  key={v.path}
                  onClick={() => void handleRecent(v.path)}
                  disabled={loading}
                  className="w-full text-left px-4 py-3 rounded-lg bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  <div className="font-medium text-zinc-800 dark:text-zinc-200 text-sm">{v.name}</div>
                  <div className="text-xs text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{v.path}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

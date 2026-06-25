import { useEffect, useState } from 'react';
import { ipc } from '../ipc.js';
import type { SyncSettings as SyncSettingsType } from '@notes-app/common';

type Mode = SyncSettingsType['syncMode'];

const MODES: { key: Mode; label: string }[] = [
  { key: 'syncthing', label: 'Syncthing' },
  { key: 'server', label: 'Server' },
  { key: 'none', label: 'None' },
];

/** Sync mode selector + bundled-server config (M7). */
export function SyncSettings() {
  const [mode, setMode] = useState<Mode>('syncthing');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void ipc.getSyncConfig().then((c) => {
      setMode(c.syncMode);
      setUrl(c.serverUrl ?? '');
      setToken(c.syncToken ?? '');
    });
  }, []);

  const persist = (next: SyncSettingsType) => {
    void ipc.setSyncConfig(next).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  const onMode = (m: Mode) => {
    setMode(m);
    persist({ syncMode: m, serverUrl: url, syncToken: token });
  };

  const onSaveServer = () => {
    persist({ syncMode: 'server', serverUrl: url.trim(), syncToken: token.trim() });
  };

  const onTest = async () => {
    setTestResult('Testing…');
    const r = await ipc.testConnection(url.trim(), token.trim());
    setTestResult(r.ok ? `Connected (v${r.version ?? '?'})` : `Failed: ${r.error ?? 'unreachable'}`);
  };

  return (
    <div data-testid="sync-settings">
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">Sync</p>
      <div className="flex gap-1.5 mb-2">
        {MODES.map((m) => (
          <button
            key={m.key}
            data-testid={`sync-mode-${m.key}`}
            onClick={() => onMode(m.key)}
            className={`flex-1 text-xs py-1 rounded border transition-colors ${
              mode === m.key
                ? 'border-accent bg-accent/20 text-white'
                : 'border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'server' && (
        <div className="space-y-1.5">
          <input
            data-testid="sync-server-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://sync.example.com"
            className="w-full bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs rounded px-2 py-1.5 outline-none placeholder-zinc-500 focus:ring-1 ring-accent"
          />
          <input
            data-testid="sync-server-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Sync token"
            className="w-full bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs rounded px-2 py-1.5 outline-none placeholder-zinc-500 focus:ring-1 ring-accent"
          />
          <div className="flex gap-1.5">
            <button
              data-testid="sync-save"
              onClick={onSaveServer}
              className="flex-1 text-xs py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            >
              Save
            </button>
            <button
              data-testid="sync-test-connection"
              onClick={() => void onTest()}
              className="flex-1 text-xs py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            >
              Test
            </button>
          </div>
          {testResult && (
            <p data-testid="sync-test-result" className="text-xs text-zinc-400 dark:text-zinc-500">
              {testResult}
            </p>
          )}
        </div>
      )}
      {saved && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Saved.</p>}
    </div>
  );
}

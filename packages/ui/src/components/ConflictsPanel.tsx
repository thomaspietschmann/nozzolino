import { useStore } from '../store.js';

export function ConflictsPanel() {
  const { conflicts, notes, setActiveConflict, toggleConflictsPanel } = useStore();

  return (
    <aside className="w-64 shrink-0 flex flex-col border-l border-zinc-800 bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
        <span className="text-sm font-medium text-zinc-200">
          Conflicts {conflicts.length > 0 && `(${conflicts.length})`}
        </span>
        <button
          onClick={toggleConflictsPanel}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors text-xs leading-none"
          title="Close panel"
        >
          ✕
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {conflicts.length === 0 ? (
          <div className="px-4 py-6 text-sm text-zinc-500 text-center">
            No conflicts — all clear ✓
          </div>
        ) : (
          <ul>
            {conflicts.map((c) => {
              const note = notes.find((n) => n.path === c.notePath);
              const title = note?.title ?? c.notePath;
              const when = new Date(c.detectedAt).toLocaleString();

              return (
                <li key={c.conflictFilePath}>
                  <button
                    onClick={() => setActiveConflict(c)}
                    className="w-full text-left px-4 py-3 border-b border-zinc-800 hover:bg-zinc-800 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-red-400 text-xs shrink-0">⚠</span>
                      <span className="text-sm text-zinc-200 font-medium truncate">{title}</span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5 ml-4">{when}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

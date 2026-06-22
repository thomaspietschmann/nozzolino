import type { ConflictRecord } from '@notes-app/common';
import { useStore } from '../store.js';

interface ConflictBannerProps {
  conflict: ConflictRecord;
}

export function ConflictBanner({ conflict }: ConflictBannerProps) {
  const { setActiveConflict } = useStore();

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-red-950/60 border-b border-red-800 text-sm shrink-0">
      <span className="text-red-400 font-medium shrink-0">⚠ Conflict</span>
      <span className="text-red-300 flex-1">
        This note has a conflict — review and merge the two versions.
      </span>
      <button
        onClick={() => setActiveConflict(conflict)}
        className="px-3 py-1 rounded bg-red-700 hover:bg-red-600 text-white text-xs font-medium transition-colors shrink-0"
      >
        Review versions
      </button>
    </div>
  );
}

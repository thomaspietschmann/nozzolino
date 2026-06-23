import { buildIndex, loadIndexFromJson } from '@notes-app/search';
import type { SearchIndex } from '@notes-app/search';
import type { NoteRecord } from '@notes-app/common';

// ─── Worker singleton ─────────────────────────────────────────────────────────

let worker: Worker | null = null;
let reqId = 0;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./indexWorker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('error', () => {
      // Worker crashed — clear so the next call spawns a fresh one.
      worker = null;
    });
  }
  return worker;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a lunr `SearchIndex` off the main thread.
 *
 * In browser environments the index is built in a Web Worker so the UI stays
 * responsive during the (potentially slow) lunr build phase. The worker sends
 * back only `idx.toJSON()` (a plain serialisable object); this function calls
 * `lunr.Index.load()` on the main thread to reconstruct the `lunr.Index`
 * instance, keeping `search()` / `runSearch()` fully synchronous.
 *
 * Fallback: when `Worker` is unavailable (Node / Vitest), falls back to the
 * synchronous `buildIndex` — so all unit tests pass untouched.
 */
export function buildIndexAsync(records: NoteRecord[]): Promise<SearchIndex> {
  // Sync fallback for Node/test environments.
  if (typeof Worker === 'undefined') {
    return Promise.resolve(buildIndex(records));
  }

  const id = ++reqId;
  const w = getWorker();

  return new Promise<SearchIndex>((resolve) => {
    const onMessage = (e: MessageEvent<{ id: number; idxJson: object }>) => {
      if (e.data.id !== id) return; // different in-flight request — keep listening
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      try {
        resolve(loadIndexFromJson(records, e.data.idxJson));
      } catch {
        // Corrupted payload — fall back to sync build.
        resolve(buildIndex(records));
      }
    };

    const onError = (_e: ErrorEvent) => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      // Worker died — fall back gracefully.
      resolve(buildIndex(records));
    };

    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, records });
  });
}

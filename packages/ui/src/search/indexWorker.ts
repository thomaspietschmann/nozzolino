/// <reference lib="webworker" />
import { buildIndex } from '@notes-app/search';
import type { NoteRecord } from '@notes-app/common';

interface WorkerRequest {
  id: number;
  records: NoteRecord[];
}

interface WorkerResponse {
  id: number;
  // lunr.Index serialized via .toJSON() — plain object, structured-clone safe.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  idxJson: any;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, records } = e.data;
  const { idx } = buildIndex(records);
  const response: WorkerResponse = { id, idxJson: idx.toJSON() };
  self.postMessage(response);
};

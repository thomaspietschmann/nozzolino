import type { EtagCache } from './syncTypes.js';

/** In-memory ETag cache. Used directly in tests; base for persistent variants. */
export class InMemoryEtagCache implements EtagCache {
  protected map = new Map<string, string>();

  async load(): Promise<void> {
    /* nothing to load */
  }
  get(path: string): string | undefined {
    return this.map.get(path);
  }
  set(path: string, etag: string): void {
    this.map.set(path, etag);
  }
  delete(path: string): void {
    this.map.delete(path);
  }
  async persist(): Promise<void> {
    /* nothing to persist */
  }
  /** Snapshot for persistence subclasses. */
  toJSON(): Record<string, string> {
    return Object.fromEntries(this.map);
  }
  /** Load from a plain object (used by persistent subclasses). */
  fromJSON(obj: Record<string, string>): void {
    this.map = new Map(Object.entries(obj));
  }
}

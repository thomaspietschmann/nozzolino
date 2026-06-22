import { describe, it, expect } from 'vitest';
import {
  isConflictFile,
  parseConflictFilename,
  makeConflictFilename,
  primaryPathForConflict,
  lineDiff,
} from './conflicts.js';

describe('isConflictFile', () => {
  it('returns true for a Syncthing conflict filename', () => {
    expect(isConflictFile('My Note.sync-conflict-20240101-120000-AABBCC.md')).toBe(true);
  });

  it('returns false for a normal note', () => {
    expect(isConflictFile('My Note.md')).toBe(false);
  });

  it('returns false for a dotfile', () => {
    expect(isConflictFile('.hidden.md')).toBe(false);
  });
});

describe('parseConflictFilename', () => {
  it('parses a standard Syncthing conflict filename', () => {
    const result = parseConflictFilename('My Note.sync-conflict-20240101-120000-AABBCC.md');
    expect(result).toEqual({ primaryStem: 'My Note', tag: '20240101-120000-AABBCC' });
  });

  it('parses a conflict filename with spaces in the stem', () => {
    const result = parseConflictFilename('Hello World.sync-conflict-20241231-235959-FFFFFF.md');
    expect(result).toEqual({ primaryStem: 'Hello World', tag: '20241231-235959-FFFFFF' });
  });

  it('returns null for a non-conflict file', () => {
    expect(parseConflictFilename('My Note.md')).toBeNull();
  });

  it('returns null for an empty filename', () => {
    expect(parseConflictFilename('')).toBeNull();
  });

  it('round-trips with makeConflictFilename', () => {
    const filename = makeConflictFilename('My Note', '2024-01-01T12:00:00.000Z');
    const parsed = parseConflictFilename(filename);
    expect(parsed).not.toBeNull();
    expect(parsed!.primaryStem).toBe('My Note');
  });
});

describe('makeConflictFilename', () => {
  it('builds a valid conflict filename from an ISO timestamp', () => {
    const name = makeConflictFilename('My Note', '2024-01-01T12:00:00.000Z');
    expect(name).toMatch(/^My Note\.sync-conflict-\d{8}-\d{6}-LOCAL\.md$/);
  });

  it('contains the expected stem', () => {
    const name = makeConflictFilename('Inbox', '2024-06-15T08:30:00.000Z');
    expect(name.startsWith('Inbox')).toBe(true);
    expect(isConflictFile(name)).toBe(true);
  });
});

describe('primaryPathForConflict', () => {
  it('resolves the primary path for a conflict file at vault root', () => {
    const result = primaryPathForConflict('My Note.sync-conflict-20240101-120000-AABBCC.md');
    expect(result).toBe('My Note.md');
  });

  it('resolves the primary path for a conflict file in a subdirectory', () => {
    const result = primaryPathForConflict(
      'sub/dir/My Note.sync-conflict-20240101-120000-AABBCC.md',
    );
    expect(result).toBe('sub/dir/My Note.md');
  });

  it('returns null for a non-conflict path', () => {
    expect(primaryPathForConflict('My Note.md')).toBeNull();
  });
});

describe('lineDiff', () => {
  it('marks equal lines', () => {
    const segs = lineDiff('hello\n', 'hello\n');
    expect(segs.every((s) => s.type === 'equal')).toBe(true);
  });

  it('marks added and removed lines', () => {
    const segs = lineDiff('line A\n', 'line B\n');
    const types = segs.map((s) => s.type);
    expect(types).toContain('removed');
    expect(types).toContain('added');
    expect(types).not.toContain('equal');
  });

  it('handles empty strings', () => {
    const segs = lineDiff('', '');
    expect(Array.isArray(segs)).toBe(true);
  });

  it('returns segments whose values reconstruct the original strings', () => {
    const current = 'line 1\nline 2\nline 3\n';
    const conflict = 'line 1\nchanged\nline 3\n';
    const segs = lineDiff(current, conflict);
    const currentReconstructed = segs
      .filter((s) => s.type !== 'added')
      .map((s) => s.value)
      .join('');
    const conflictReconstructed = segs
      .filter((s) => s.type !== 'removed')
      .map((s) => s.value)
      .join('');
    expect(currentReconstructed).toBe(current);
    expect(conflictReconstructed).toBe(conflict);
  });
});

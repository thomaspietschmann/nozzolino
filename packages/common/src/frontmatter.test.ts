import { describe, expect, it } from 'vitest';
import { parseFrontmatter, serializeFrontmatter } from './frontmatter.js';

describe('parseFrontmatter', () => {
  it('parses a note with all frontmatter fields', () => {
    const content = `---
id: abc-123
tags:
  - architecture
  - backend
emoji: 🗄️
created: 2026-01-15T10:30:00Z
modified: 2026-06-20T14:22:11Z
---

# Sync Architecture

Body content here.`;

    const { frontmatter, body } = parseFrontmatter(content);

    expect(frontmatter.id).toBe('abc-123');
    expect(frontmatter.tags).toEqual(['architecture', 'backend']);
    expect(frontmatter.emoji).toBe('🗄️');
    expect(frontmatter.created).toBe('2026-01-15T10:30:00Z');
    expect(frontmatter.modified).toBe('2026-06-20T14:22:11Z');
    expect(body).toContain('Body content here.');
  });

  it('returns empty tags and no id for a note with no frontmatter', () => {
    const content = 'Just plain text, no frontmatter at all.';
    const { frontmatter, body } = parseFrontmatter(content);

    expect(frontmatter.tags).toEqual([]);
    expect(frontmatter.id).toBeUndefined();
    expect(frontmatter.emoji).toBeUndefined();
    expect(body.trim()).toBe('Just plain text, no frontmatter at all.');
  });

  it('tags is always an array, never a string', () => {
    const content = `---\ntags:\n  - design\n---\nBody.`;
    const { frontmatter } = parseFrontmatter(content);

    expect(Array.isArray(frontmatter.tags)).toBe(true);
    expect(frontmatter.tags).toEqual(['design']);
  });

  it('normalises a single-string tag value to an array', () => {
    // Edge case: someone manually writes `tags: backend` (not a list)
    const content = `---\ntags: backend\n---\nBody.`;
    const { frontmatter } = parseFrontmatter(content);

    expect(Array.isArray(frontmatter.tags)).toBe(true);
    expect(frontmatter.tags).toEqual(['backend']);
  });

  it('returns empty tags array when tags is missing', () => {
    const content = `---\nid: x\n---\nBody.`;
    const { frontmatter } = parseFrontmatter(content);

    expect(frontmatter.tags).toEqual([]);
  });

  it('preserves unknown frontmatter fields from external editors', () => {
    const content = `---\ntags: []\ncustom_field: hello\n---\nBody.`;
    const { frontmatter } = parseFrontmatter(content);

    expect(frontmatter['custom_field']).toBe('hello');
  });
});

describe('serializeFrontmatter', () => {
  it('produces a string starting with YAML frontmatter delimiters', () => {
    const frontmatter = { tags: ['a', 'b'], modified: '2026-01-01T00:00:00Z' };
    const result = serializeFrontmatter(frontmatter, '\nHello world.');

    expect(result).toMatch(/^---\n/);
    expect(result).toContain('Hello world.');
  });

  it('round-trips without data loss', () => {
    const original = `---
id: test-uuid
tags:
  - one
  - two
emoji: 📝
created: 2026-01-01T00:00:00Z
modified: 2026-06-01T00:00:00Z
---

Body text here.`;

    const { frontmatter, body } = parseFrontmatter(original);
    const serialized = serializeFrontmatter(frontmatter, body);
    const { frontmatter: rt } = parseFrontmatter(serialized);

    expect(rt.id).toBe('test-uuid');
    expect(rt.tags).toEqual(['one', 'two']);
    expect(rt.emoji).toBe('📝');
    expect(rt.created).toBe('2026-01-01T00:00:00Z');
    expect(rt.modified).toBe('2026-06-01T00:00:00Z');
  });

  it('preserves emoji through parse/serialize round-trip', () => {
    const content = `---\ntags: []\nemoji: 🚀\n---\nBody.`;
    const { frontmatter, body } = parseFrontmatter(content);
    const serialized = serializeFrontmatter(frontmatter, body);
    const { frontmatter: roundtripped } = parseFrontmatter(serialized);

    expect(roundtripped.emoji).toBe('🚀');
  });
});

import { describe, it, expect } from 'vitest';
import { mergeForSave } from './saveNote.js';
import { parseFrontmatter } from '@notes-app/common';

const FIXED_ID = '00000000-0000-0000-0000-000000000001';
const BODY = '# Hello\n\nworld\n';

describe('mergeForSave', () => {
  it('assigns id and created/modified when file has no frontmatter', () => {
    const out = mergeForSave(null, BODY, { id: FIXED_ID });
    const { frontmatter, body } = parseFrontmatter(out);
    expect(frontmatter.id).toBe(FIXED_ID);
    expect(typeof frontmatter.created).toBe('string');
    expect(typeof frontmatter.modified).toBe('string');
    expect(body).toBe(BODY);
  });

  it('preserves existing id and created', () => {
    const raw = `---\nid: ${FIXED_ID}\ncreated: "2024-01-01T00:00:00.000Z"\ntags: []\n---\n${BODY}`;
    const out = mergeForSave(raw, BODY, { id: 'other-id' });
    const { frontmatter } = parseFrontmatter(out);
    expect(frontmatter.id).toBe(FIXED_ID);
    expect(frontmatter.created).toBe('2024-01-01T00:00:00.000Z');
  });

  it('bumps modified on every save', () => {
    const raw = `---\nid: ${FIXED_ID}\ntags: []\nmodified: "2020-01-01T00:00:00.000Z"\n---\n${BODY}`;
    const out = mergeForSave(raw, BODY, { id: FIXED_ID });
    const { frontmatter } = parseFrontmatter(out);
    expect(frontmatter.modified).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('preserves tags and emoji', () => {
    const raw = `---\nid: ${FIXED_ID}\ntags:\n  - foo\n  - bar\nemoji: "📝"\n---\n${BODY}`;
    const out = mergeForSave(raw, BODY, { id: FIXED_ID });
    const { frontmatter } = parseFrontmatter(out);
    expect(frontmatter.tags).toEqual(['foo', 'bar']);
    expect(frontmatter.emoji).toBe('📝');
  });

  it('does not duplicate frontmatter on repeated saves', () => {
    let raw: string | null = null;
    for (let i = 0; i < 3; i++) {
      raw = mergeForSave(raw, BODY, { id: FIXED_ID });
    }
    // Should have exactly two '---' delimiter lines (open + close)
    const dashes = (raw ?? '').match(/^---$/gm) ?? [];
    expect(dashes).toHaveLength(2);
  });

  it('uses provided id when raw content has no frontmatter', () => {
    // BODY starts with '# Hello', not '---', so parseFrontmatter returns empty fm
    const out = mergeForSave(BODY, BODY, { id: FIXED_ID });
    const { frontmatter } = parseFrontmatter(out);
    expect(frontmatter.id).toBe(FIXED_ID);
  });
});

import { describe, expect, it } from 'vitest';
import { parseWikiLinks, replaceWikiLinkTarget } from './wikilinks.js';

describe('parseWikiLinks', () => {
  it('parses a plain wikilink', () => {
    const links = parseWikiLinks('See [[My Note]] for details.');

    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({ targetTitle: 'My Note', relationshipType: null });
  });

  it('parses a wikilink with a relationship type', () => {
    const links = parseWikiLinks('This is [[Client Corp||client of]].');

    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({ targetTitle: 'Client Corp', relationshipType: 'client of' });
  });

  it('parses multiple wikilinks in one string', () => {
    const links = parseWikiLinks('[[NoteA]] and [[NoteB||references]].');

    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({ targetTitle: 'NoteA', relationshipType: null });
    expect(links[1]).toEqual({ targetTitle: 'NoteB', relationshipType: 'references' });
  });

  it('returns an empty array when no wikilinks are present', () => {
    expect(parseWikiLinks('No links here.')).toEqual([]);
    expect(parseWikiLinks('')).toEqual([]);
  });

  it('trims whitespace from title and relationship type', () => {
    const links = parseWikiLinks('[[ My Note || client of ]]');

    expect(links[0]).toEqual({ targetTitle: 'My Note', relationshipType: 'client of' });
  });

  it('does not match a single-pipe alias syntax [[Title|alias]]', () => {
    // Our separator is ||. Single | is excluded from the title group.
    const links = parseWikiLinks('[[Title|alias]]');

    expect(links).toHaveLength(0);
  });

  it('does not match an empty relationship type [[Title||]]', () => {
    // The regex requires at least one non-] char after ||
    const links = parseWikiLinks('[[Title||]]');

    // Either zero results (no match) or a match with a null relType — never an empty string
    const hasEmptyRelType = links.some((l) => l.relationshipType === '');
    expect(hasEmptyRelType).toBe(false);
  });

  it('handles multiple links in a body with mixed types', () => {
    const body = `
# My Note

See [[Architecture||DEPENDS_ON]] and also [[Database]] for background.
The [[Frontend||USES]] layer talks to [[API Gateway||CALLS]].
    `;
    const links = parseWikiLinks(body);

    expect(links).toHaveLength(4);
    expect(links[0]).toEqual({ targetTitle: 'Architecture', relationshipType: 'DEPENDS_ON' });
    expect(links[1]).toEqual({ targetTitle: 'Database', relationshipType: null });
    expect(links[2]).toEqual({ targetTitle: 'Frontend', relationshipType: 'USES' });
    expect(links[3]).toEqual({ targetTitle: 'API Gateway', relationshipType: 'CALLS' });
  });
});

describe('replaceWikiLinkTarget', () => {
  it('replaces a plain wikilink title', () => {
    const result = replaceWikiLinkTarget('See [[Old Name]] here.', 'Old Name', 'New Name');

    expect(result).toBe('See [[New Name]] here.');
  });

  it('preserves the relationship type after rename', () => {
    const result = replaceWikiLinkTarget(
      'This [[Old Name||client of]] thing.',
      'Old Name',
      'New Name'
    );

    expect(result).toBe('This [[New Name||client of]] thing.');
  });

  it('replaces all occurrences including mixed plain and typed links', () => {
    const result = replaceWikiLinkTarget('[[A]] and [[A||ref]] and [[A||dep]]', 'A', 'B');

    expect(result).toBe('[[B]] and [[B||ref]] and [[B||dep]]');
  });

  it('does not replace partial matches inside longer titles', () => {
    // "Architecture" should not be replaced when renaming "Arch"
    const result = replaceWikiLinkTarget('[[Architecture Note]]', 'Architecture', 'Design');

    expect(result).toBe('[[Architecture Note]]');
  });

  it('is case-sensitive (Linux filesystem is case-sensitive)', () => {
    const result = replaceWikiLinkTarget('[[my note]]', 'My Note', 'New Note');

    expect(result).toBe('[[my note]]'); // no change
  });

  it('returns the original string unchanged when old title is not found', () => {
    const content = 'No links to [[Something Else]] here.';
    const result = replaceWikiLinkTarget(content, 'Old Name', 'New Name');

    expect(result).toBe(content);
  });

  it('handles a title containing regex special characters', () => {
    // Titles can theoretically contain dots, parens, etc.
    const result = replaceWikiLinkTarget(
      'See [[My (Important) Note]] here.',
      'My (Important) Note',
      'My Note'
    );

    expect(result).toBe('See [[My Note]] here.');
  });
});

import { describe, it, expect } from 'vitest';
import type { NoteRecord } from '@notes-app/common';
import { buildElements, neighbourhood, filterByRelTypes, getRelTypes } from './buildGraph.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNote(partial: Partial<NoteRecord> & { id: string; title: string }): NoteRecord {
  return {
    path: `${partial.title}.md`,
    emoji: null,
    tags: [],
    outlinks: [],
    modified: new Date('2024-01-01'),
    bodyText: '',
    ...partial,
  };
}

// ─── buildElements ────────────────────────────────────────────────────────────

describe('buildElements()', () => {
  const alpha = makeNote({ id: 'a', title: 'Alpha' });
  const beta = makeNote({
    id: 'b',
    title: 'Beta',
    outlinks: [{ targetTitle: 'Alpha', relationshipType: null }],
  });
  const gamma = makeNote({
    id: 'g',
    title: 'Gamma',
    outlinks: [
      { targetTitle: 'Alpha', relationshipType: 'inspires' },
      { targetTitle: 'NonExistent', relationshipType: null },
    ],
  });

  const elements = buildElements([alpha, beta, gamma]);

  it('creates one node per note', () => {
    const nodes = elements.filter((e) => e.group === 'nodes');
    expect(nodes).toHaveLength(3);
  });

  it('creates an edge for each resolved outlink', () => {
    const edges = elements.filter((e) => e.group === 'edges');
    expect(edges).toHaveLength(2); // Beta→Alpha and Gamma→Alpha; NonExistent skipped
  });

  it('skips dangling links', () => {
    const edgeIds = elements.filter((e) => e.group === 'edges').map((e) => e.data.id);
    expect(edgeIds.every((id) => !id.includes('NonExistent'))).toBe(true);
  });

  it('resolves target title case-insensitively', () => {
    const note = makeNote({
      id: 'x',
      title: 'X',
      outlinks: [{ targetTitle: 'ALPHA', relationshipType: null }],
    });
    const els = buildElements([alpha, note]);
    const edges = els.filter((e) => e.group === 'edges');
    expect(edges).toHaveLength(1);
    if (edges[0]?.group === 'edges') {
      expect(edges[0].data.target).toBe('a');
    }
  });

  it('uses emoji as label when present', () => {
    const emojiNote = makeNote({ id: 'e', title: 'Emu', emoji: '🦅' });
    const els = buildElements([emojiNote]);
    const node = els.find((e) => e.group === 'nodes');
    if (node?.group === 'nodes') {
      expect(node.data.label).toBe('🦅');
    }
  });

  it('uses first letter as label when no emoji', () => {
    const els = buildElements([alpha]);
    const node = els.find((e) => e.group === 'nodes');
    if (node?.group === 'nodes') {
      expect(node.data.label).toBe('A');
    }
  });

  it('embeds relType in edge id so parallel typed edges are unique', () => {
    const src = makeNote({
      id: 's',
      title: 'S',
      outlinks: [
        { targetTitle: 'T', relationshipType: 'likes' },
        { targetTitle: 'T', relationshipType: 'dislikes' },
      ],
    });
    const tgt = makeNote({ id: 't', title: 'T' });
    const els = buildElements([src, tgt]);
    const edges = els.filter((e) => e.group === 'edges');
    expect(edges).toHaveLength(2);
    // ids must be distinct
    expect(new Set(edges.map((e) => e.data.id)).size).toBe(2);
  });
});

// ─── neighbourhood ────────────────────────────────────────────────────────────

describe('neighbourhood()', () => {
  // A → B → C → D; also E → A
  const notes = [
    makeNote({ id: 'A', title: 'A', outlinks: [{ targetTitle: 'B', relationshipType: null }] }),
    makeNote({ id: 'B', title: 'B', outlinks: [{ targetTitle: 'C', relationshipType: null }] }),
    makeNote({ id: 'C', title: 'C', outlinks: [{ targetTitle: 'D', relationshipType: null }] }),
    makeNote({ id: 'D', title: 'D' }),
    makeNote({ id: 'E', title: 'E', outlinks: [{ targetTitle: 'A', relationshipType: null }] }),
  ];
  const all = buildElements(notes);

  it('depth-1 includes focal node', () => {
    const sub = neighbourhood(all, 'A', 1);
    const ids = sub.filter((e) => e.group === 'nodes').map((e) => e.data.id);
    expect(ids).toContain('A');
  });

  it('depth-1 includes out-neighbour', () => {
    const sub = neighbourhood(all, 'A', 1);
    const ids = sub.filter((e) => e.group === 'nodes').map((e) => e.data.id);
    expect(ids).toContain('B');
  });

  it('depth-1 includes in-neighbour (E → A)', () => {
    const sub = neighbourhood(all, 'A', 1);
    const ids = sub.filter((e) => e.group === 'nodes').map((e) => e.data.id);
    expect(ids).toContain('E');
  });

  it('depth-1 does NOT include depth-2 node', () => {
    const sub = neighbourhood(all, 'A', 1);
    const ids = sub.filter((e) => e.group === 'nodes').map((e) => e.data.id);
    expect(ids).not.toContain('C');
    expect(ids).not.toContain('D');
  });

  it('depth-2 includes depth-2 node', () => {
    const sub = neighbourhood(all, 'A', 2);
    const ids = sub.filter((e) => e.group === 'nodes').map((e) => e.data.id);
    expect(ids).toContain('C');
  });

  it('depth-2 does NOT include depth-3 node', () => {
    const sub = neighbourhood(all, 'A', 2);
    const ids = sub.filter((e) => e.group === 'nodes').map((e) => e.data.id);
    expect(ids).not.toContain('D');
  });

  it('only includes edges between visible nodes', () => {
    const sub = neighbourhood(all, 'A', 1);
    const edgeTargets = sub.filter((e) => e.group === 'edges').map((e) => e.data.target);
    // E→A edge is included, A→B edge is included
    expect(edgeTargets).toContain('A');
    expect(edgeTargets).toContain('B');
    // B→C edge is NOT included (C not visible)
    expect(edgeTargets).not.toContain('C');
  });
});

// ─── filterByRelTypes ─────────────────────────────────────────────────────────

describe('filterByRelTypes()', () => {
  const notes = [
    makeNote({
      id: '1',
      title: 'One',
      outlinks: [
        { targetTitle: 'Two', relationshipType: 'inspires' },
        { targetTitle: 'Three', relationshipType: 'blocks' },
      ],
    }),
    makeNote({ id: '2', title: 'Two' }),
    makeNote({ id: '3', title: 'Three' }),
    makeNote({ id: '4', title: 'Four' }), // no edges
  ];
  const all = buildElements(notes);

  it('empty types returns all elements', () => {
    expect(filterByRelTypes(all, [])).toHaveLength(all.length);
  });

  it('keeps only matching edges', () => {
    const filtered = filterByRelTypes(all, ['inspires']);
    const edges = filtered.filter((e) => e.group === 'edges');
    expect(edges).toHaveLength(1);
    if (edges[0]?.group === 'edges') {
      expect(edges[0].data.label).toBe('inspires');
    }
  });

  it('retains incident nodes of matching edges', () => {
    const filtered = filterByRelTypes(all, ['inspires']);
    const nodeIds = filtered.filter((e) => e.group === 'nodes').map((e) => e.data.id);
    expect(nodeIds).toContain('1'); // source
    expect(nodeIds).toContain('2'); // target
  });

  it('drops nodes not incident to any matching edge', () => {
    const filtered = filterByRelTypes(all, ['inspires']);
    const nodeIds = filtered.filter((e) => e.group === 'nodes').map((e) => e.data.id);
    expect(nodeIds).not.toContain('3'); // only linked via 'blocks'
    expect(nodeIds).not.toContain('4'); // no edges at all
  });
});

// ─── getRelTypes ──────────────────────────────────────────────────────────────

describe('getRelTypes()', () => {
  const notes = [
    makeNote({
      id: '1',
      title: 'One',
      outlinks: [
        { targetTitle: 'Two', relationshipType: 'inspires' },
        { targetTitle: 'Three', relationshipType: 'inspires' }, // duplicate
        { targetTitle: 'Four', relationshipType: null }, // plain link — empty label
      ],
    }),
    makeNote({ id: '2', title: 'Two', outlinks: [{ targetTitle: 'One', relationshipType: 'blocks' }] }),
    makeNote({ id: '3', title: 'Three' }),
    makeNote({ id: '4', title: 'Four' }),
  ];
  const all = buildElements(notes);

  it('returns distinct non-empty labels', () => {
    expect(getRelTypes(all)).toEqual(['blocks', 'inspires']);
  });

  it('excludes empty-string labels (plain [[link]])', () => {
    expect(getRelTypes(all)).not.toContain('');
  });

  it('returns results in sorted order', () => {
    const types = getRelTypes(all);
    expect([...types].sort()).toEqual(types);
  });
});

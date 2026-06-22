import type { NoteRecord } from '@notes-app/common';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GraphNode {
  group: 'nodes';
  data: { id: string; label: string; title: string; emoji: string | null };
}

export interface GraphEdge {
  group: 'edges';
  data: { id: string; source: string; target: string; label: string };
}

export type GraphElement = GraphNode | GraphEdge;

// ─── buildElements ────────────────────────────────────────────────────────────

/**
 * Build the full set of Cytoscape elements from the note corpus.
 *
 * - One node per note; label = emoji or first letter of title.
 * - One edge per resolved outlink. Dangling links (target title not found) are
 *   silently skipped — they may become ghost nodes in a future milestone.
 * - Title resolution is case-insensitive, last-wins (mirrors VaultIndex.byTitle).
 * - Parallel typed edges between the same pair of notes get unique ids because
 *   the relationship type is embedded in the edge id.
 */
export function buildElements(notes: NoteRecord[]): GraphElement[] {
  // Build a case-insensitive title → id map (last-wins mirrors VaultIndex)
  const titleMap = new Map<string, string>();
  for (const note of notes) {
    titleMap.set(note.title.toLowerCase(), note.id);
  }

  const elements: GraphElement[] = [];

  for (const note of notes) {
    const firstChar = note.title.charAt(0) || '?';
    const label = note.emoji !== null ? note.emoji : firstChar;

    elements.push({
      group: 'nodes',
      data: { id: note.id, label, title: note.title, emoji: note.emoji },
    });

    for (const outlink of note.outlinks) {
      const targetId = titleMap.get(outlink.targetTitle.toLowerCase());
      if (targetId === undefined) continue; // dangling link — skip

      const relType = outlink.relationshipType ?? '';
      // Include relType in id so parallel typed edges between the same pair are unique
      const edgeId = `${note.id}->${targetId}:${relType}`;

      elements.push({
        group: 'edges',
        data: { id: edgeId, source: note.id, target: targetId, label: relType },
      });
    }
  }

  return elements;
}

// ─── neighbourhood ────────────────────────────────────────────────────────────

/**
 * Return the induced subgraph containing `focalId` and all nodes reachable
 * within `depth` hops via either in- or out-edges.
 *
 * Default depth is 1 (direct neighbours only). Passing `Infinity` returns the
 * connected component of the focal node.
 */
export function neighbourhood(
  elements: GraphElement[],
  focalId: string,
  depth = 1
): GraphElement[] {
  const nodes = elements.filter((e): e is GraphNode => e.group === 'nodes');
  const edges = elements.filter((e): e is GraphEdge => e.group === 'edges');

  const visited = new Set<string>([focalId]);

  for (let hop = 0; hop < depth; hop++) {
    const frontier = new Set(visited);
    for (const edge of edges) {
      if (frontier.has(edge.data.source)) visited.add(edge.data.target);
      if (frontier.has(edge.data.target)) visited.add(edge.data.source);
    }
  }

  const visibleNodes = nodes.filter((n) => visited.has(n.data.id));
  // Only keep edges where both endpoints are in the visible set
  const visibleEdges = edges.filter(
    (e) => visited.has(e.data.source) && visited.has(e.data.target)
  );

  return [...visibleNodes, ...visibleEdges];
}

// ─── filterByRelTypes ─────────────────────────────────────────────────────────

/**
 * Keep only edges whose label matches one of the given `types`, plus the nodes
 * incident to those edges. Passing an empty array returns all elements unchanged.
 */
export function filterByRelTypes(
  elements: GraphElement[],
  types: string[]
): GraphElement[] {
  if (types.length === 0) return elements;

  const typeSet = new Set(types);
  const matchingEdges = elements.filter(
    (e): e is GraphEdge => e.group === 'edges' && typeSet.has(e.data.label)
  );

  const retainedIds = new Set<string>();
  for (const edge of matchingEdges) {
    retainedIds.add(edge.data.source);
    retainedIds.add(edge.data.target);
  }

  const retainedNodes = elements.filter(
    (e): e is GraphNode => e.group === 'nodes' && retainedIds.has(e.data.id)
  );

  return [...retainedNodes, ...matchingEdges];
}

// ─── getRelTypes ──────────────────────────────────────────────────────────────

/** Return distinct non-empty edge labels (relationship types), sorted. */
export function getRelTypes(elements: GraphElement[]): string[] {
  const seen = new Set<string>();
  for (const el of elements) {
    if (el.group === 'edges' && el.data.label) {
      seen.add(el.data.label);
    }
  }
  return [...seen].sort();
}

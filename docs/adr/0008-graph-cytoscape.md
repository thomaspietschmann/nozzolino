# ADR-0008: Graph View — Cytoscape.js + fcose

- **Date:** 2026-06-22
- **Status:** Accepted
- **Source:** `technical-guidelines.md` §7 (Authoritative)

---

## Context

The graph view must display all notes as nodes with named, directional edges representing
relationships. Requirements:

- Force-directed layout
- Pan, zoom (mouse wheel + on-screen controls on desktop; pinch-to-zoom on Android)
- Default view: current note + depth-1 neighbours; full-vault view on demand
- Filterable by relationship type
- Node label: note's emoji (or first letter of title as fallback)
- Edge label: relationship type string
- Clicking a node navigates to that note
- Must be a daily navigation tool — must be fast
- Required on mobile (pinch-to-zoom)

---

## Decision

**Library:** `cytoscape` + `cytoscape-fcose` layout plugin, integrated via `react-cytoscapejs`.

### Data structure

The `packages/graph` package provides a `buildCytoscapeElements` function that projects the
`VaultIndex` into Cytoscape `ElementDefinition[]`:

```typescript
// Node
{ data: { id: note.id, label: note.emoji ?? note.title[0], title: note.title } }

// Edge
{ data: {
    id: `${outlink.sourceId}->${outlink.targetId}-${outlink.relType ?? ''}`,
    source: outlink.sourceId,
    target: outlink.targetId,
    label: outlink.relType ?? ''
} }
```

### Layout

`fcose` is run once on mount. The layout result is **not persisted** — re-opening the graph
re-runs the layout. This is explicitly permitted by the requirements ("force-directed,
rearranges on each open — acceptable").

### Depth filtering

The default depth-1 view is implemented by filtering `elements` **before** passing to
Cytoscape. This means the layout only computes positions for the visible nodes, not all nodes.
The "Show full graph" button replaces the filtered set with all elements and re-runs layout.

Filtering is done in `packages/graph` as a pure function over `ElementDefinition[]` (not by
hiding nodes in Cytoscape after layout), which ensures layout quality for the visible subgraph.

### Styling

| Element | Style |
|---|---|
| Focal node | `background-color: var(--accent-500)` |
| Neighbour nodes | Muted surface colour |
| Node label | Emoji or first-letter; `font-size` bound to zoom level via `mapData` |
| Edges | Directional arrows; `label` = relationship type; visible only above a zoom threshold |
| Selected node | Ring in accent colour |
| Hover tooltip | Title + incoming back-reference count (via Cytoscape `tippy` or custom DOM tooltip) |

---

## Alternatives Rejected

**D3-force:**
No built-in React wrapper; requires custom SVG rendering pipeline; touch/zoom on mobile
must be implemented manually. Significant boilerplate for what `react-cytoscapejs` provides out of the box.

**Sigma.js:**
Good performance at very large graphs (10,000+ nodes), but overkill at <1,000 notes. Its
React integration is less mature than Cytoscape's. Edge label rendering is less flexible.

**vis-network:**
Adequate for simple use cases but has a history of breaking API changes, and its TypeScript
types are incomplete. The node/edge customisation needed for emoji labels and `mapData` zoom
scaling is more cumbersome than in Cytoscape.

---

## Consequences

- Cytoscape is a large dependency (~800KB minified). Acceptable for a desktop app; on Android
  the bundle is loaded from local assets so network size is not a concern.
- `fcose` re-runs the full layout on every filter change or depth expansion. At <1,000 nodes
  this is fast (<100ms). If the user ever reaches hundreds of notes with dense relationships,
  the layout may take a few hundred milliseconds — acceptable for an interactive tool.
- The layout is not stable across sessions (re-runs on open). The user cannot pin nodes to
  fixed positions. This is explicitly accepted in the requirements.
- Cytoscape's built-in touch zoom covers the Android pinch-to-zoom requirement without any
  custom gesture code in the Capacitor layer.

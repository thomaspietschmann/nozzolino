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

**Library:** `cytoscape` + `cytoscape-fcose` layout plugin, integrated **directly via a
DOM ref in a `useEffect`** — NOT via the `react-cytoscapejs` wrapper (unmaintained, React 18
friction). The Cytoscape instance is created on mount and destroyed on cleanup; the container
div is mounted as `absolute inset-0` inside a relative wrapper.

### Data model

`Outlink` (in `packages/common`) carries `targetTitle: string` and
`relationshipType: string | null`. There is **no `targetId`** field on `Outlink` — the edge
target id is resolved at graph-build time via a case-insensitive title → id map that mirrors
`VaultIndex.getBacklinks` / `getNoteByTitle` (last-wins).

The `packages/graph` package provides pure, node-testable functions over `NoteRecord[]`:

```typescript
// Node
{ group: 'nodes', data: { id: note.id, label: note.emoji ?? note.title[0], title, emoji } }

// Edge — source/target resolved from targetTitle via title Map
{ group: 'edges', data: {
    id: `${srcId}->${targetId}:${relType}`,   // relType in id → parallel typed edges stay unique
    source: srcId,
    target: targetId,
    label: relType ?? ''
} }
```

`buildElements(notes)` builds the full element set. Dangling outlinks (target note not found)
are silently skipped. `neighbourhood(elements, focalId, depth)` filters to a BFS subgraph
(both in- and out-edges). `filterByRelTypes(elements, types)` narrows by edge label.

Filtering is done **before** passing to Cytoscape so the layout only computes positions for
visible nodes (depth default: 1; "Full graph" toggle disables the filter).

### Layout

`fcose` is run once on mount (`animate: false`). Every filter change or depth expansion
destroys and recreates the Cytoscape instance so fcose can re-lay out cleanly. The layout
result is **not persisted** — re-opening the graph re-runs the layout. This is explicitly
permitted by the requirements ("force-directed, rearranges on each open — acceptable").

### Styling

| Element | Style |
|---|---|
| Focal node | `background-color: rgb(<--accent channels>)` (derived from store accent preset) |
| Neighbour nodes | Muted zinc-700 surface |
| Node label | Emoji or first-letter; fixed font-size |
| Edges | Directional arrows (`triangle`); `label` = relationship type |
| Selected node | Border ring in accent colour |
| Hover tooltip | Title + backlink count (custom DOM div, positioned via `renderedPosition`) |

The graph toggle lives in `NoteHeader` (⬡ button) and the global shortcut `Ctrl/Cmd+G`.
`graphOpen` state lives in the Zustand store; focal note, depth, and rel-type filter are
local state inside `GraphView` (reset on each open).

---

## Alternatives Rejected

**`react-cytoscapejs` wrapper:**
Unmaintained; introduces friction with React 18 (strict-mode double-invoke); its `useEffect`
contract is hard to reason about. Dropped in favour of a direct `useEffect` with a ref —
the same pattern already used by `NoteEditor` (ProseMirror) and `WikilinkPeek`.

**D3-force:**
No built-in React wrapper; requires custom SVG rendering pipeline; touch/zoom on mobile
must be implemented manually. Significant boilerplate for what Cytoscape provides out of the box.

**Sigma.js:**
Good performance at very large graphs (10,000+ nodes), but overkill at <1,000 notes. Its
React integration is less mature than Cytoscape's. Edge label rendering is less flexible.

**vis-network:**
Adequate for simple use cases but has a history of breaking API changes, and its TypeScript
types are incomplete. The node/edge customisation needed for emoji labels is more cumbersome
than in Cytoscape.

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

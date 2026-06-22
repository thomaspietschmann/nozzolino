import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { ACCENT_PRESETS } from '@notes-app/common';
import { useStore } from '../store.js';
import { buildElements, neighbourhood, filterByRelTypes, getRelTypes } from '@notes-app/graph';
import type { GraphElement } from '@notes-app/graph';

// Register fcose once at module load
cytoscape.use(fcose);

interface TooltipState {
  x: number;
  y: number;
  title: string;
  backlinkCount: number;
}

export function GraphView() {
  const { notes, activeNoteId, accent, theme, selectNote, setGraphOpen } = useStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const [focalId, setFocalId] = useState<string | null>(activeNoteId);
  const [showFull, setShowFull] = useState(false);
  const [selectedRelTypes, setSelectedRelTypes] = useState<string[]>([]);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Derive the accent colour directly from the store preset
  const accentRgb = useMemo((): string => {
    const preset = ACCENT_PRESETS.find((p) => p.key === accent);
    if (!preset) return 'rgb(99, 102, 241)';
    const hex = preset.value;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${r}, ${g}, ${b})`;
  }, [accent]);

  // Build full element set from corpus
  const allElements = useMemo(() => buildElements(notes), [notes]);

  // Available relationship types (for filter chips)
  const availableRelTypes = useMemo(() => getRelTypes(allElements), [allElements]);

  // Compute the elements to display after depth + rel-type filtering
  const displayElements = useMemo((): GraphElement[] => {
    let els = allElements;
    if (!showFull && focalId !== null) {
      els = neighbourhood(els, focalId, 1);
    }
    if (selectedRelTypes.length > 0) {
      els = filterByRelTypes(els, selectedRelTypes);
    }
    return els;
  }, [allElements, focalId, showFull, selectedRelTypes]);

  // Mount / reinit Cytoscape whenever the displayed elements or focal style change.
  // The entire instance is destroyed and recreated so fcose can re-lay out cleanly.
  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = theme === 'dark';
    const nodeColor = isDark ? '#3f3f46' : '#e4e4e7';    // zinc-700 / zinc-200
    const nodeLabelColor = isDark ? '#e4e4e7' : '#18181b'; // zinc-200 / zinc-900
    const edgeColor = isDark ? '#52525b' : '#a1a1aa';    // zinc-600 / zinc-400
    const edgeLabelColor = isDark ? '#71717a' : '#52525b'; // zinc-500 / zinc-600

    const cy = cytoscape({
      container: containerRef.current,
      elements: displayElements as cytoscape.ElementDefinition[],
      style: [
        {
          selector: 'node',
          style: {
            'background-color': nodeColor,
            'label': 'data(label)',
            'color': nodeLabelColor,
            'font-size': 14,
            'text-valign': 'center',
            'text-halign': 'center',
            'width': 36,
            'height': 36,
          },
        },
        {
          // Focal node gets the accent colour and is slightly larger
          selector: focalId !== null ? `node[id = "${focalId}"]` : 'node.__none__',
          style: {
            'background-color': accentRgb,
            'width': 48,
            'height': 48,
            'font-size': 18,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': accentRgb,
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 1.5,
            'line-color': edgeColor,
            'target-arrow-color': edgeColor,
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': 10,
            'color': edgeLabelColor,
            'text-opacity': 0,                // hidden by default; visible at high zoom
          },
        },
      ],
      layout: { name: 'fcose', animate: false } as cytoscape.LayoutOptions,
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
    });

    cyRef.current = cy;

    // Single tap: refocus the graph and navigate to the note
    cy.on('tap', 'node', (evt) => {
      const id = evt.target.data('id') as string;
      setFocalId(id);
      void selectNote(id);
    });

    // Hover: show custom tooltip
    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target as cytoscape.NodeSingular;
      const title = node.data('title') as string;
      // Count backlinks within the displayed subgraph
      const backlinkCount = cy.edges(`[target = "${node.id()}"]`).length;
      const pos = node.renderedPosition();
      setTooltip({ x: pos.x + 52, y: pos.y - 24, title, backlinkCount });
    });

    cy.on('mouseout', 'node', () => {
      setTooltip(null);
    });

    return () => {
      setTooltip(null);
      cy.destroy();
      cyRef.current = null;
    };
  }, [displayElements, focalId, accentRgb, theme, selectNote]);

  const toggleRelType = useCallback((type: string) => {
    setSelectedRelTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }, []);

  const zoomIn = useCallback(() => {
    const cy = cyRef.current;
    if (cy) cy.zoom(cy.zoom() * 1.25);
  }, []);

  const zoomOut = useCallback(() => {
    const cy = cyRef.current;
    if (cy) cy.zoom(cy.zoom() / 1.25);
  }, []);

  const fitView = useCallback(() => {
    cyRef.current?.fit();
  }, []);

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-white dark:bg-zinc-950">
      {/* Controls bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex-wrap shrink-0">
        {/* Depth toggle */}
        <button
          onClick={() => setShowFull((v) => !v)}
          className={`px-2 py-1 text-xs rounded border transition-colors ${
            showFull
              ? 'border-accent bg-accent/20 text-white'
              : 'border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200'
          }`}
        >
          {showFull ? 'Full graph' : 'Neighbours'}
        </button>

        {/* Rel-type filter chips */}
        {availableRelTypes.map((type) => (
          <button
            key={type}
            onClick={() => toggleRelType(type)}
            className={`px-2 py-1 text-xs rounded border transition-colors ${
              selectedRelTypes.includes(type)
                ? 'border-accent bg-accent/20 text-white'
                : 'border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200'
            }`}
          >
            {type}
          </button>
        ))}

        <div className="flex-1" />

        {/* Zoom controls */}
        <button
          title="Zoom in"
          onClick={zoomIn}
          className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors font-mono text-sm leading-none"
        >
          +
        </button>
        <button
          title="Zoom out"
          onClick={zoomOut}
          className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors font-mono text-sm leading-none"
        >
          −
        </button>
        <button
          title="Fit to view"
          onClick={fitView}
          className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors text-xs leading-none"
        >
          ⊡
        </button>
        <button
          title="Close graph (Ctrl+G)"
          onClick={() => setGraphOpen(false)}
          className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors text-xs leading-none"
        >
          ✕
        </button>
      </div>

      {/* Graph canvas + tooltip, both positioned within this relative container */}
      <div className="flex-1 relative overflow-hidden">
        <div ref={containerRef} className="absolute inset-0" />

        {tooltip !== null && (
          <div
            className="absolute pointer-events-none z-10 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 shadow-lg max-w-48"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <div className="font-medium truncate">{tooltip.title}</div>
            {tooltip.backlinkCount > 0 && (
              <div className="text-zinc-500 dark:text-zinc-400 mt-0.5">
                {tooltip.backlinkCount} backlink{tooltip.backlinkCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

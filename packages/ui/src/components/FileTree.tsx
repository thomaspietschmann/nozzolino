import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { NoteRecord } from '@notes-app/common';
import { useStore } from '../store.js';

type TreeNode =
  | { kind: 'folder'; name: string; pathKey: string; children: TreeNode[] }
  | { kind: 'note'; record: NoteRecord };

function buildTree(notes: NoteRecord[]): TreeNode[] {
  const folderMap = new Map<string, TreeNode & { kind: 'folder' }>();
  const rootNodes: TreeNode[] = [];

  const getOrCreateFolder = (pathKey: string, name: string, parentList: TreeNode[]): TreeNode & { kind: 'folder' } => {
    if (folderMap.has(pathKey)) return folderMap.get(pathKey)!;
    const node: TreeNode & { kind: 'folder' } = { kind: 'folder', name, pathKey, children: [] };
    folderMap.set(pathKey, node);
    parentList.push(node);
    return node;
  };

  for (const note of notes) {
    const parts = note.path.split('/');
    if (parts.length === 1) {
      rootNodes.push({ kind: 'note', record: note });
    } else {
      let parentList = rootNodes;
      for (let i = 0; i < parts.length - 1; i++) {
        const pathKey = parts.slice(0, i + 1).join('/');
        const folder = getOrCreateFolder(pathKey, parts[i]!, parentList);
        parentList = folder.children;
      }
      parentList.push({ kind: 'note', record: note });
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      const aName = a.kind === 'folder' ? a.name : a.record.title;
      const bName = b.kind === 'folder' ? b.name : b.record.title;
      return aName.localeCompare(bName);
    });
    for (const node of nodes) {
      if (node.kind === 'folder') sortNodes(node.children);
    }
  };
  sortNodes(rootNodes);
  return rootNodes;
}

function collectFolderKeys(nodes: TreeNode[]): Set<string> {
  const keys = new Set<string>();
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      if (n.kind === 'folder') {
        keys.add(n.pathKey);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return keys;
}

type VisibleItem =
  | { kind: 'folder'; pathKey: string; name: string; depth: number; expanded: boolean }
  | { kind: 'note'; record: NoteRecord; depth: number };

function buildVisible(nodes: TreeNode[], expandedFolders: Set<string>, depth = 0): VisibleItem[] {
  const items: VisibleItem[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder') {
      const expanded = expandedFolders.has(node.pathKey);
      items.push({ kind: 'folder', pathKey: node.pathKey, name: node.name, depth, expanded });
      if (expanded) items.push(...buildVisible(node.children, expandedFolders, depth + 1));
    } else {
      items.push({ kind: 'note', record: node.record, depth });
    }
  }
  return items;
}

interface FileTreeProps {
  notes: NoteRecord[];
}

export function FileTree({ notes }: FileTreeProps) {
  const { activeNoteId, selectNote, deleteNote, setSidebarOpen } = useStore();
  const [contextMenu, setContextMenu] = useState<{ noteId: string; x: number; y: number } | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLElement>>(new Map());

  const tree = buildTree(notes);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => collectFolderKeys(tree));

  // Keep expandedFolders current when new folders appear (e.g. note moved into new subdir)
  useEffect(() => {
    const allKeys = collectFolderKeys(buildTree(notes));
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const k of allKeys) {
        if (!next.has(k)) { next.add(k); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [notes]);

  const visible = buildVisible(tree, expandedFolders);

  const toggleFolder = useCallback((pathKey: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(pathKey)) next.delete(pathKey);
      else next.add(pathKey);
      return next;
    });
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (visible.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, visible.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const item = focusedIndex >= 0 ? visible[focusedIndex] : null;
      if (item?.kind === 'folder') {
        e.preventDefault();
        if (e.key === 'ArrowRight' && !item.expanded) toggleFolder(item.pathKey);
        if (e.key === 'ArrowLeft' && item.expanded) toggleFolder(item.pathKey);
      }
    } else if (e.key === 'Enter') {
      const item = focusedIndex >= 0 ? visible[focusedIndex] : null;
      if (item?.kind === 'note') {
        e.preventDefault();
        void selectNote(item.record.id);
      } else if (item?.kind === 'folder') {
        e.preventDefault();
        toggleFolder(item.pathKey);
      }
    }
  };

  // Scroll focused row into view
  useEffect(() => {
    const el = rowRefs.current.get(focusedIndex);
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  const closeMenu = () => setContextMenu(null);

  const setRowRef = (index: number, el: HTMLElement | null) => {
    if (el) rowRefs.current.set(index, el);
    else rowRefs.current.delete(index);
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onBlur={() => setFocusedIndex(-1)}
      onClick={closeMenu}
    >
      {visible.length === 0 && (
        <p className="px-4 py-8 text-center text-zinc-400 dark:text-zinc-500 text-sm">No notes yet</p>
      )}

      {visible.map((item, index) => {
        const indentClass = item.depth > 0 ? `pl-${3 + item.depth * 4}` : 'pl-3';
        const isFocused = focusedIndex === index;

        if (item.kind === 'folder') {
          return (
            <button
              key={item.pathKey}
              ref={(el) => setRowRef(index, el)}
              className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 rounded mx-1 transition-colors ${indentClass} text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${isFocused ? 'ring-1 ring-inset ring-accent/50' : ''}`}
              onClick={() => toggleFolder(item.pathKey)}
            >
              <span className="shrink-0 text-[10px]">{item.expanded ? '▼' : '▶'}</span>
              <span className="truncate">{item.name}</span>
            </button>
          );
        }

        const note = item.record;
        const isActive = activeNoteId === note.id;
        return (
          <button
            key={note.id}
            ref={(el) => setRowRef(index, el)}
            data-testid="note-row"
            className={`w-full text-left py-2 text-sm flex items-center gap-2 rounded-lg mx-1 transition-colors ${indentClass} ${
              isActive
                ? 'bg-accent/20 text-zinc-900 dark:text-white'
                : `text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white${isFocused ? ' ring-1 ring-inset ring-accent/50' : ''}`
            }`}
            onClick={() => {
              void selectNote(note.id);
              // Auto-close drawer on mobile after selecting a note
              if (window.innerWidth < 768) setSidebarOpen(false);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ noteId: note.id, x: e.clientX, y: e.clientY });
            }}
          >
            {note.emoji && <span className="shrink-0">{note.emoji}</span>}
            <span className="truncate flex-1">{note.title}</span>
            {note.tags.length > 0 && (
              <span className="text-xs text-zinc-400 dark:text-zinc-600 shrink-0 pr-1">
                {note.tags.length > 1 ? `${note.tags.length} tags` : note.tags[0]}
              </span>
            )}
          </button>
        );
      })}

      {contextMenu && (
        <ContextMenu
          noteId={contextMenu.noteId}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeMenu}
          onDelete={(id) => {
            void deleteNote(id);
            closeMenu();
          }}
        />
      )}
    </div>
  );
}

interface ContextMenuProps {
  noteId: string;
  x: number;
  y: number;
  onClose: () => void;
  onDelete: (id: string) => void;
}

function ContextMenu({ noteId, x, y, onClose, onDelete }: ContextMenuProps) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 min-w-36"
        style={{ left: x, top: y }}
      >
        <button
          className="w-full text-left px-4 py-2 text-sm text-red-500 dark:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
          onClick={() => onDelete(noteId)}
        >
          Delete note
        </button>
      </div>
    </>
  );
}

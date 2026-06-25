import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../store.js';
import { getAllTags } from '@notes-app/search';
import { ipc } from '../ipc.js';

export function CommandPalette() {
  const {
    searchOpen,
    searchQuery,
    selectedTags,
    notes,
    setSearchOpen,
    setSearchQuery,
    toggleSelectedTag,
    setPendingScrollTerm,
    runSearch,
    getTagFilteredNotes,
    selectNote,
    createNote,
    toggleFrontmatterPanel,
    toggleHelp,
  } = useStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [debounced, setDebounced] = useState(searchQuery);

  // Debounce the search query
  useEffect(() => {
    const t = setTimeout(() => setDebounced(searchQuery), 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Focus input when palette opens; reset index
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
      setSelectedIndex(0);
      setDebounced('');
    }
  }, [searchOpen]);

  // Reset selection when results change
  const selectedTagsKey = selectedTags.join(',');
  useEffect(() => {
    setSelectedIndex(0);
  }, [debounced, selectedTagsKey]);

  const close = useCallback(() => {
    setSearchOpen(false);
  }, [setSearchOpen]);

  const allTags = getAllTags(notes);

  // Build result list: search hits when query present, tag-filtered when not
  const noteResults =
    debounced.trim()
      ? runSearch(debounced)
      : getTagFilteredNotes()
          .sort((a, b) => b.modified.getTime() - a.modified.getTime())
          .slice(0, 12)
          .map((n) => ({ noteId: n.id, title: n.title, snippet: '', score: 0 }));

  // Vault-wide actions always shown below results
  const actions: { label: string; icon: string; run: () => void }[] = [
    {
      label: 'New note',
      icon: '＋',
      run: () => {
        close();
        const title = debounced.trim() || 'Untitled';
        void createNote(title);
      },
    },
    {
      label: 'Toggle metadata panel',
      icon: '≡',
      run: () => {
        close();
        toggleFrontmatterPanel();
      },
    },
    {
      label: 'Export vault to ZIP…',
      icon: '↓',
      run: () => {
        close();
        void ipc.exportZip();
      },
    },
    {
      label: 'Keyboard shortcuts',
      icon: '⌨',
      run: () => {
        close();
        toggleHelp();
      },
    },
  ];

  const totalItems = noteResults.length + actions.length;

  const navigate = (id: string) => {
    close();
    setPendingScrollTerm(debounced.trim() || null);
    void selectNote(id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % totalItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + totalItems) % totalItems);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex < noteResults.length) {
        const r = noteResults[selectedIndex];
        if (r) navigate(r.noteId);
      } else {
        const action = actions[selectedIndex - noteResults.length];
        action?.run();
      }
    } else if (e.key === 'Escape') {
      close();
    }
  };

  if (!searchOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={close} />

      {/* Panel */}
      <div className="fixed z-50 top-[15vh] left-1/2 -translate-x-1/2 w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl overflow-hidden flex flex-col">

        {/* Input */}
        <div className="flex items-center px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <span className="text-zinc-400 dark:text-zinc-500 mr-3 text-lg">🔍</span>
          <input
            ref={inputRef}
            type="text"
            data-testid="palette-input"
            placeholder="Search notes… (Ctrl+K)"
            className="flex-1 bg-transparent text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {searchQuery && (
            <button
              className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 ml-2 text-xs"
              onClick={() => setSearchQuery('')}
            >
              ✕
            </button>
          )}
          <kbd className="ml-3 text-xs text-zinc-400 dark:text-zinc-600 border border-zinc-300 dark:border-zinc-700 rounded px-1 py-0.5">Esc</kbd>
        </div>

        {/* Tag filter chips */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800">
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleSelectedTag(tag)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  selectedTags.includes(tag)
                    ? 'bg-accent/30 border-accent/60 text-white'
                    : 'border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        <div className="overflow-y-auto max-h-80">
          {noteResults.length === 0 && debounced.trim() && (
            <p className="px-4 py-6 text-center text-zinc-400 dark:text-zinc-500 text-sm">No notes found for "{debounced}"</p>
          )}

          {noteResults.map((result, i) => {
            const note = notes.find((n) => n.id === result.noteId);
            return (
              <button
                key={result.noteId}
                className={`w-full text-left px-4 py-2.5 flex flex-col gap-0.5 transition-colors ${
                  i === selectedIndex ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50'
                }`}
                onMouseDown={() => navigate(result.noteId)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <div className="flex items-center gap-2">
                  {note?.emoji && <span className="shrink-0">{note.emoji}</span>}
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{result.title}</span>
                  {note && note.tags.length > 0 && (
                    <span className="text-xs text-zinc-400 dark:text-zinc-600 ml-auto shrink-0">{note.tags.join(', ')}</span>
                  )}
                </div>
                {result.snippet && (
                  <p
                    className="text-xs text-zinc-500 dark:text-zinc-400 truncate pl-0"
                    // snippet already has <mark> tags; we sanitize by only allowing <mark>
                    dangerouslySetInnerHTML={{
                      __html: result.snippet.replace(/<(?!\/?(mark)[ >])[^>]+>/g, ''),
                    }}
                  />
                )}
              </button>
            );
          })}

          {/* Divider + vault-wide actions */}
          {noteResults.length > 0 && <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />}
          {actions.map((action, i) => {
            const idx = noteResults.length + i;
            return (
              <button
                key={action.label}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                  idx === selectedIndex ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50'
                }`}
                onMouseDown={action.run}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <span className="text-zinc-400 dark:text-zinc-500">{action.icon}</span>
                <span className="text-sm text-zinc-700 dark:text-zinc-300">{action.label}</span>
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-600">
          <span><kbd className="border border-zinc-300 dark:border-zinc-700 rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="border border-zinc-300 dark:border-zinc-700 rounded px-1">↵</kbd> open</span>
          <span><kbd className="border border-zinc-300 dark:border-zinc-700 rounded px-1">Esc</kbd> close</span>
        </div>
      </div>
    </>
  );
}

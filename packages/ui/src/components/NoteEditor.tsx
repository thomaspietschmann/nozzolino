import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { EditorView, TextSelection, createEditorState, toMarkdown } from '@notes-app/editor';
import type { CreateEditorStateOptions, SaveImageFn } from '@notes-app/editor';
import { AUTOSAVE_DEBOUNCE_MS } from '@notes-app/common';
import { useStore } from '../store.js';

interface NoteEditorProps {
  content: string;
  noteId: string;
}

export function NoteEditor({ content, noteId }: NoteEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable ref holding the current editor options for use in the external-update
  // effect (V2 fix: ensures all plugins are reused, not just content).
  const optsRef = useRef<CreateEditorStateOptions>({});

  const {
    saveNote,
    setDirty,
    notes,
    createNote,
    relationshipTypes,
    registerEditorFlush,
    pendingScrollTerm,
    setPendingScrollTerm,
  } = useStore();

  const handleSave = useCallback(
    (markdown: string) => {
      void saveNote(markdown);
    },
    [saveNote]
  );

  const saveImage: SaveImageFn = useCallback(
    async (blob: Blob, ext: string) => {
      const activePath = notes.find((n) => n.id === noteId)?.path ?? '';
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1] ?? '';
          window.electronAPI
            .invoke<string>('image:save', base64, ext, activePath)
            .then(resolve)
            .catch(reject);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    },
    [notes, noteId]
  );

  const getSuggestions = useCallback(
    (query: string) => {
      const lower = query.toLowerCase();
      return notes
        .filter((n) => n.title.toLowerCase().includes(lower))
        .slice(0, 8)
        .map((n) => ({ title: n.title, emoji: n.emoji }));
    },
    [notes]
  );

  const isResolved = useCallback(
    (title: string) => notes.some((n) => n.title.toLowerCase() === title.toLowerCase()),
    [notes]
  );

  const getTypeSuggestions = useCallback(
    (query: string) => {
      const lower = query.toLowerCase();
      return relationshipTypes.filter((t) => t.toLowerCase().includes(lower));
    },
    [relationshipTypes]
  );

  const onCreateNote = useCallback(
    (title: string) => void createNote(title),
    [createNote]
  );

  // Keep optsRef current so the external-update effect always has all plugins (V2 fix).
  const opts = useMemo<CreateEditorStateOptions>(
    () => ({ saveImage, getSuggestions, getTypeSuggestions, isResolved, onCreateNote }),
    [saveImage, getSuggestions, getTypeSuggestions, isResolved, onCreateNote]
  );
  optsRef.current = opts;

  // Register an imperative flush handle so store.setTags can ensure the disk
  // body is up to date before patching frontmatter (V1 fix).
  useEffect(() => {
    const flush = async () => {
      const view = viewRef.current;
      if (!view) return;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const markdown = toMarkdown(view.state.doc);
      await saveNote(markdown);
    };
    registerEditorFlush(flush);
    return () => {
      registerEditorFlush(null);
    };
  }, [saveNote, registerEditorFlush]);

  // Create or destroy the view when the note changes
  useEffect(() => {
    if (!mountRef.current) return;

    viewRef.current?.destroy();

    const state = createEditorState({ content, ...optsRef.current });

    const view = new EditorView(mountRef.current, {
      state,
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr);
        view.updateState(newState);

        if (tr.docChanged) {
          setDirty(true);
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => {
            const markdown = toMarkdown(newState.doc);
            handleSave(markdown);
          }, AUTOSAVE_DEBOUNCE_MS);
        }
      },
    });

    viewRef.current = view;
    view.focus();

    // Scroll to first search match if we arrived here via the command palette
    if (pendingScrollTerm) {
      scrollToTerm(view, pendingScrollTerm);
      setPendingScrollTerm(null);
    }

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      view.destroy();
      viewRef.current = null;
    };
    // noteId triggers full re-mount; pendingScrollTerm is consumed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // Update content if it changes from outside (e.g. watcher reload).
  // V2 fix: rebuild with the full plugin set so autocomplete/image/validation
  // are preserved, and try to keep the cursor position.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = toMarkdown(view.state.doc);
    if (current === content) return;

    const prevAnchor = view.state.selection.anchor;
    const newState = createEditorState({ content, ...optsRef.current });
    // Remap selection — clamp to new doc size to avoid out-of-range errors
    try {
      const safeAnchor = Math.min(prevAnchor, newState.doc.content.size);
      const sel = TextSelection.create(newState.doc, safeAnchor);
      view.updateState(newState.apply(newState.tr.setSelection(sel)));
    } catch {
      view.updateState(newState);
    }
  }, [content]);

  return (
    <div
      ref={mountRef}
      className="prose-editor flex-1 px-12 py-8 text-zinc-100 overflow-y-auto"
    />
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Scroll the view to the first text occurrence of `term` using PM doc walk. */
function scrollToTerm(view: EditorView, term: string): void {
  const termLower = term.toLowerCase();
  let found: { from: number; to: number } | null = null;

  view.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.isText && node.text) {
      const idx = node.text.toLowerCase().indexOf(termLower);
      if (idx !== -1) {
        found = { from: pos + idx, to: pos + idx + term.length };
        return false;
      }
    }
    return undefined;
  });

  if (!found) return;
  const { from, to } = found;
  try {
    const sel = TextSelection.create(view.state.doc, from, to);
    view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
    view.focus();
  } catch {
    // Position out of range — skip scroll
  }
}

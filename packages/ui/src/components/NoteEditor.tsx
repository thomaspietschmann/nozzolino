import React, { useEffect, useRef, useCallback } from 'react';
import { EditorView, createEditorState, toMarkdown } from '@notes-app/editor';
import type { SaveImageFn } from '@notes-app/editor';
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
  const { saveNote, setDirty, notes, createNote, relationshipTypes } = useStore();

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

  // Create or destroy the view when the note changes
  useEffect(() => {
    if (!mountRef.current) return;

    viewRef.current?.destroy();

    const getSuggestions = (query: string) => {
      const lower = query.toLowerCase();
      return notes
        .filter((n) => n.title.toLowerCase().includes(lower))
        .slice(0, 8)
        .map((n) => ({ title: n.title, emoji: n.emoji }));
    };

    const isResolved = (title: string) =>
      notes.some((n) => n.title.toLowerCase() === title.toLowerCase());

    const getTypeSuggestions = (query: string) => {
      const lower = query.toLowerCase();
      return relationshipTypes.filter((t) => t.toLowerCase().includes(lower));
    };

    const state = createEditorState({
      content,
      saveImage,
      getSuggestions,
      getTypeSuggestions,
      isResolved,
      onCreateNote: (title) => void createNote(title),
    });

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

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      view.destroy();
      viewRef.current = null;
    };
    // noteId triggers full re-mount; other deps (handleSave, saveImage) are stable refs
  }, [noteId]);

  // Update content if it changes from outside (e.g. watcher reload)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = toMarkdown(view.state.doc);
    if (current === content) return;
    const newState = createEditorState({ content });
    view.updateState(newState);
  }, [content]);

  return (
    <div
      ref={mountRef}
      className="prose-editor flex-1 px-12 py-8 text-zinc-100 overflow-y-auto"
    />
  );
}

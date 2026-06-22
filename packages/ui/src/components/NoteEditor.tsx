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
  const { saveNote, setDirty } = useStore();

  const handleSave = useCallback(
    (markdown: string) => {
      void saveNote(markdown);
    },
    [saveNote]
  );

  const saveImage: SaveImageFn = useCallback(async (blob: Blob, ext: string) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1] ?? '';
        window.electronAPI
          .invoke<string>('image:save', base64, ext)
          .then(resolve)
          .catch(reject);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }, []);

  // Create the view when the component mounts or noteId changes
  useEffect(() => {
    if (!mountRef.current) return;

    // Destroy previous view
    viewRef.current?.destroy();

    const state = createEditorState({ content, saveImage });

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
    const newState = createEditorState({ content, saveImage });
    view.updateState(newState);
  }, [content]);

  return (
    <div
      ref={mountRef}
      className="prose-editor flex-1 px-12 py-8 text-zinc-100 overflow-y-auto"
    />
  );
}

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { ipc } from '../ipc.js';

/**
 * Listens for mouseover events on .wikilink elements and shows a read-only
 * preview of the target note in a floating panel.
 */
export function WikilinkPeek() {
  const notes = useStore((s) => s.notes);
  const [peek, setPeek] = useState<{
    title: string;
    content: string;
    x: number;
    y: number;
  } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.wikilink');
      if (!target) return;

      const title = target.getAttribute('data-title') ?? '';
      const note = notes.find((n) => n.title.toLowerCase() === title.toLowerCase());
      if (!note) return;

      if (hideTimer.current) clearTimeout(hideTimer.current);

      ipc
        .readFile(note.path)
        .then((content) => {
          const rect = target.getBoundingClientRect();
          setPeek({ title, content: excerpt(content), x: rect.left, y: rect.bottom + 8 });
        })
        .catch(() => null);
    };

    const handleOut = (e: MouseEvent) => {
      // Only react to mouseout events where the mouse leaves a .wikilink element.
      const wikilink = (e.target as HTMLElement).closest('.wikilink');
      if (!wikilink) return;
      // Ignore transitions to child elements of the same wikilink (e.g. inner spans).
      const to = e.relatedTarget as HTMLElement | null;
      if (to && wikilink.contains(to)) return;
      hideTimer.current = setTimeout(() => setPeek(null), 500);
    };

    document.addEventListener('mouseover', handleOver);
    document.addEventListener('mouseout', handleOut);
    return () => {
      document.removeEventListener('mouseover', handleOver);
      document.removeEventListener('mouseout', handleOut);
    };
  }, [notes]);

  // Dismiss on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPeek(null);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  if (!peek) return null;

  return (
    <div
      className="fixed z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl p-4 max-w-lg text-sm text-zinc-700 dark:text-zinc-300"
      style={{ left: Math.min(peek.x, window.innerWidth - 520), top: peek.y }}
      onMouseEnter={() => { if (hideTimer.current) clearTimeout(hideTimer.current); }}
      onMouseLeave={() => { hideTimer.current = setTimeout(() => setPeek(null), 500); }}
    >
      <p className="font-semibold text-zinc-900 dark:text-white mb-2">{peek.title}</p>
      <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">{peek.content}</p>
    </div>
  );
}

function excerpt(content: string): string {
  // Strip frontmatter
  let body = content;
  if (content.startsWith('---\n')) {
    const end = content.indexOf('\n---', 4);
    if (end !== -1) body = content.slice(end + 4);
  }
  // First 300 chars of body
  return body.trim().slice(0, 300) + (body.trim().length > 300 ? '…' : '');
}

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { ipc } from '../ipc.js';

/**
 * Listens for mouseover events (desktop) and long-press touch events (mobile)
 * on .wikilink elements and shows a read-only preview of the target note.
 */
// Estimated max height of the preview panel (px). Used to decide above/below.
const PANEL_HEIGHT = 240;
// Long-press duration in ms — just under Android's native callout (~500ms).
const LONG_PRESS_MS = 450;
// Touch move slop in px — cancel long-press if finger moves more than this.
const TOUCH_SLOP = 10;

export function WikilinkPeek() {
  const notes = useStore((s) => s.notes);
  const [peek, setPeek] = useState<{
    title: string;
    content: string;
    x: number;
    linkTop: number;
    linkBottom: number;
  } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // Shared show logic for both mouse hover and long-press touch.
  const showPeekFor = (target: Element) => {
    const title = target.getAttribute('data-title') ?? '';
    const note = notes.find((n) => n.title.toLowerCase() === title.toLowerCase());
    if (!note) return;

    if (hideTimer.current) clearTimeout(hideTimer.current);

    ipc
      .readFile(note.path)
      .then((content) => {
        const rect = target.getBoundingClientRect();
        setPeek({
          title,
          content: excerpt(content),
          x: rect.left,
          linkTop: rect.top,
          linkBottom: rect.bottom,
        });
      })
      .catch(() => null);
  };

  // ── Desktop: mouseover / mouseout ────────────────────────────────────────
  useEffect(() => {
    const handleOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.wikilink');
      if (!target) return;
      showPeekFor(target);
    };

    const handleOut = (e: MouseEvent) => {
      const wikilink = (e.target as HTMLElement).closest('.wikilink');
      if (!wikilink) return;
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
  }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mobile: long-press touchstart / touchend / touchmove ────────────────
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      const target = (e.target as HTMLElement).closest('.wikilink');
      if (!target) return;

      const touch = e.touches[0];
      if (!touch) return;
      touchStartX.current = touch.clientX;
      touchStartY.current = touch.clientY;
      longPressFired.current = false;

      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true;
        showPeekFor(target);
      }, LONG_PRESS_MS);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!longPressTimer.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = Math.abs(touch.clientX - touchStartX.current);
      const dy = Math.abs(touch.clientY - touchStartY.current);
      if (dx > TOUCH_SLOP || dy > TOUCH_SLOP) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };

    const handleTouchEnd = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      // If long-press fired, swallow the synthetic click so the wikilink
      // navigation action doesn't trigger immediately after the peek.
      if (longPressFired.current) {
        longPressFired.current = false;
        document.addEventListener(
          'click',
          (e) => {
            e.stopPropagation();
            e.preventDefault();
          },
          { capture: true, once: true },
        );
      }
    };

    const handleTouchCancel = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      longPressFired.current = false;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Touch-outside dismissal ───────────────────────────────────────────────
  useEffect(() => {
    if (!peek) return;
    const handleTouchOutside = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest('[data-testid="wikilink-peek"]') &&
        !target.closest('.wikilink')
      ) {
        setPeek(null);
      }
    };
    document.addEventListener('touchstart', handleTouchOutside, { passive: true });
    return () => document.removeEventListener('touchstart', handleTouchOutside);
  }, [peek]);

  // ── Dismiss on Escape ─────────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPeek(null);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  if (!peek) return null;

  // Flip above the wikilink when there's not enough space below.
  const spaceBelow = window.innerHeight - peek.linkBottom - 8;
  const above = spaceBelow < PANEL_HEIGHT && peek.linkTop > spaceBelow;
  const top = above ? undefined : peek.linkBottom + 8;
  const bottom = above ? window.innerHeight - peek.linkTop + 8 : undefined;
  const left = Math.min(Math.max(8, peek.x), window.innerWidth - 520);

  return (
    <div
      data-testid="wikilink-peek"
      className="fixed z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl p-4 max-w-lg text-sm text-zinc-700 dark:text-zinc-300"
      style={{ left, top, bottom }}
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

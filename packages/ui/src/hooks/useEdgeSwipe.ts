import { useEffect } from 'react';

interface EdgeSwipeOptions {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** Left edge threshold in px to start an open swipe. Default: 24 */
  edgeThreshold?: number;
  /** Minimum horizontal distance in px to trigger. Default: 60 */
  swipeDistance?: number;
}

/**
 * Attaches document-level touch listeners to drive an off-canvas drawer:
 *   - Swipe right from the left edge  → onOpen()
 *   - Swipe left from anywhere        → onClose()  (only when already open)
 *
 * Only active when window.innerWidth < 768px (below the md breakpoint).
 * Uses `passive: true` so it never blocks scroll.
 */
export function useEdgeSwipe({
  isOpen,
  onOpen,
  onClose,
  edgeThreshold = 24,
  swipeDistance = 60,
}: EdgeSwipeOptions): void {
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let edgeStart = false;
    let fired = false;

    const onTouchStart = (e: TouchEvent) => {
      if (window.innerWidth >= 768) return;
      const touch = e.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      edgeStart = startX <= edgeThreshold;
      fired = false;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (window.innerWidth >= 768 || fired) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      // Require horizontal dominance to avoid fighting vertical scroll
      if (Math.abs(dx) <= Math.abs(dy) * 1.5) return;
      if (dx > swipeDistance && edgeStart && !isOpen) {
        fired = true;
        onOpen();
      } else if (dx < -swipeDistance && isOpen) {
        fired = true;
        onClose();
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [isOpen, onOpen, onClose, edgeThreshold, swipeDistance]);
}

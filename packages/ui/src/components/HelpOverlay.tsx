import React from 'react';
import { useStore } from '../store.js';
import { SHORTCUT_GROUPS, MOD } from '../help/shortcuts.js';

/**
 * Keyboard-shortcut cheatsheet overlay.
 *
 * Opens via:
 *   - '?' global shortcut (guarded — does not fire when focus is in editor / input)
 *   - '⌨' button in the Sidebar header
 *   - "Keyboard shortcuts" action in the command palette
 *
 * Closes via Esc or clicking the backdrop.
 */
export function HelpOverlay() {
  const { helpOpen, setHelpOpen } = useStore();

  if (!helpOpen) return null;

  const close = () => setHelpOpen(false);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={close} />

      {/* Panel */}
      <div
        className="fixed z-50 top-[5vh] left-1/2 -translate-x-1/2 w-full max-w-2xl max-h-[90vh] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <span>⌨</span>
            <span>Keyboard shortcuts</span>
          </h2>
          <button
            onClick={close}
            className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 text-lg leading-none transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Shortcut groups */}
        <div className="overflow-y-auto flex-1 p-5 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
                {group.title}
              </h3>
              <table className="w-full text-sm">
                <tbody>
                  {group.rows.map((row) => (
                    <tr
                      key={row.description}
                      className="border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                    >
                      <td className="py-1.5 pr-3 whitespace-nowrap align-top">
                        <span className="flex flex-wrap gap-1">
                          {row.keys.map((k) => (
                            <kbd
                              key={k}
                              className="inline-block border border-zinc-300 dark:border-zinc-600 rounded px-1 py-0.5 text-xs font-mono text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800"
                            >
                              {k}
                            </kbd>
                          ))}
                        </span>
                      </td>
                      <td className="py-1.5 text-zinc-600 dark:text-zinc-400 align-top">
                        {row.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-400 dark:text-zinc-600">
          <span>Modifier key: <kbd className="border border-zinc-300 dark:border-zinc-600 rounded px-1">{MOD}</kbd></span>
          <span><kbd className="border border-zinc-300 dark:border-zinc-600 rounded px-1">Esc</kbd> close</span>
        </div>
      </div>
    </>
  );
}

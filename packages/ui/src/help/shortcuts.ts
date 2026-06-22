/**
 * Canonical keyboard shortcut and Markdown autoformat reference.
 * Drives the HelpOverlay component and mirrors the tables in docs/features.md.
 * Keep both in sync when adding new shortcuts.
 */

export interface ShortcutRow {
  keys: string[];
  description: string;
}

export interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

// Resolved at module load time — fine for both Electron (navigator.platform) and tests.
const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl';

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Global',
    rows: [
      { keys: [`${MOD}+K`], description: 'Open command palette / search' },
      { keys: [`${MOD}+G`], description: 'Toggle graph view' },
      { keys: ['⌨ button'], description: 'Show keyboard shortcuts (this overlay)' },
      { keys: ['Esc'], description: 'Close overlay / deselect' },
    ],
  },
  {
    title: 'Editor — Formatting',
    rows: [
      { keys: [`${MOD}+B`], description: 'Bold' },
      { keys: [`${MOD}+I`], description: 'Italic' },
      { keys: [`${MOD}+\``], description: 'Inline code' },
      { keys: [`Shift+${MOD}+S`], description: 'Strikethrough' },
      { keys: [`${MOD}+1`], description: 'Heading 1' },
      { keys: [`${MOD}+2`], description: 'Heading 2' },
      { keys: [`${MOD}+3`], description: 'Heading 3' },
      { keys: [`${MOD}+0`], description: 'Paragraph (remove heading)' },
      { keys: [`${MOD}+>`], description: 'Blockquote' },
      { keys: [`${MOD}+Z`], description: 'Undo' },
      { keys: [`Shift+${MOD}+Z`], description: 'Redo' },
    ],
  },
  {
    title: 'Editor — Lists & Blocks',
    rows: [
      { keys: ['Tab'], description: 'Indent list item' },
      { keys: ['Shift+Tab'], description: 'Outdent list item' },
      { keys: ['Enter'], description: 'New list item / split block' },
      { keys: ['Shift+Enter'], description: 'Exit code block' },
      { keys: ['Alt+↑'], description: 'Join with block above' },
      { keys: ['Alt+↓'], description: 'Join with block below' },
    ],
  },
  {
    title: 'Markdown Autoformat',
    rows: [
      { keys: ['# ', '## ', '### '], description: 'Heading 1 / 2 / 3' },
      { keys: ['> '], description: 'Blockquote' },
      { keys: ['- ', '* ', '+ '], description: 'Bullet list' },
      { keys: ['1. '], description: 'Ordered list' },
      { keys: ['``` '], description: 'Code block (add language after ```)' },
      { keys: ['---'], description: 'Horizontal rule' },
      { keys: ['**text**', '__text__'], description: 'Bold' },
      { keys: ['*text*', '_text_'], description: 'Italic' },
      { keys: ['`text`'], description: 'Inline code' },
      { keys: ['~~text~~'], description: 'Strikethrough' },
    ],
  },
  {
    title: 'Navigation & Wikilinks',
    rows: [
      { keys: ['[['], description: 'Open wikilink autocomplete' },
      { keys: ['↑ ↓'], description: 'Navigate results in palette / autocomplete' },
      { keys: ['↵'], description: 'Confirm selection / open note' },
      { keys: ['Esc'], description: 'Close palette / autocomplete / overlay' },
    ],
  },
];

import { keymap } from 'prosemirror-keymap';
import {
  toggleMark,
  setBlockType,
  wrapIn,
  exitCode,
  joinUp,
  joinDown,
  lift,
  selectParentNode,
  baseKeymap,
} from 'prosemirror-commands';
import { undo, redo } from 'prosemirror-history';
import {
  splitListItem,
  liftListItem,
  sinkListItem,
} from 'prosemirror-schema-list';
import type { Plugin } from 'prosemirror-state';
import { schema } from '../schema.js';

const mac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

export function buildKeymaps(): Plugin[] {
  const keys: Record<string, ReturnType<typeof toggleMark>> = {
    'Mod-z': undo,
    'Shift-Mod-z': redo,
    'Mod-b': toggleMark(schema.marks['strong']!),
    'Mod-i': toggleMark(schema.marks['em']!),
    'Mod-`': toggleMark(schema.marks['code']!),
    'Shift-Mod-s': toggleMark(schema.marks['strikethrough']!),
    'Alt-ArrowUp': joinUp,
    'Alt-ArrowDown': joinDown,
    'Mod-BracketLeft': lift,
    Escape: selectParentNode,
    'Shift-Enter': exitCode,
    'Mod-1': setBlockType(schema.nodes['heading']!, { level: 1 }),
    'Mod-2': setBlockType(schema.nodes['heading']!, { level: 2 }),
    'Mod-3': setBlockType(schema.nodes['heading']!, { level: 3 }),
    'Mod-0': setBlockType(schema.nodes['paragraph']!),
    'Mod->': wrapIn(schema.nodes['blockquote']!),
    Enter: splitListItem(schema.nodes['list_item']!),
    Tab: sinkListItem(schema.nodes['list_item']!),
    'Shift-Tab': liftListItem(schema.nodes['list_item']!),
  };

  if (!mac) {
    keys['Ctrl-y'] = redo;
  }

  return [keymap(keys), keymap(baseKeymap)];
}

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
    // Tab: indent list item when inside a list; otherwise swallow the key so the
    // browser does not cycle focus away from the editor.  In code blocks, insert
    // two spaces as indentation instead.
    Tab: (state, dispatch) => {
      if (sinkListItem(schema.nodes['list_item']!)(state, dispatch)) return true;
      if (state.selection.$from.parent.type.name === 'code_block') {
        if (dispatch) dispatch(state.tr.insertText('  '));
        return true;
      }
      return true; // swallow Tab everywhere to prevent focus cycling
    },
    // Shift-Tab: outdent list item; otherwise swallow to prevent reverse focus cycling.
    'Shift-Tab': (state, dispatch) => {
      liftListItem(schema.nodes['list_item']!)(state, dispatch);
      return true;
    },
  };

  if (!mac) {
    keys['Ctrl-y'] = redo;
  } else {
    // Cmd+` (Mod-`) is intercepted by Electron's default "Cycle Windows" menu accelerator
    // on macOS and never reaches ProseMirror.  Register Ctrl+` as a working alternative.
    keys['Ctrl-`'] = toggleMark(schema.marks['code']!);
  }

  return [keymap(keys), keymap(baseKeymap)];
}

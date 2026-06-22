import { EditorState } from 'prosemirror-state';
import { history } from 'prosemirror-history';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { tableEditing, columnResizing } from 'prosemirror-tables';
import { schema } from './schema.js';
import { fromMarkdown } from './serialization/fromMarkdown.js';
import { buildInputRules } from './plugins/inputRules.js';
import { buildKeymaps } from './plugins/keymaps.js';
import { buildCursorRevealPlugin } from './plugins/cursorReveal.js';
import { buildSyntaxHighlightPlugin } from './plugins/syntaxHighlight.js';
import type { SaveImageFn } from './plugins/imagePaste.js';
import { buildImagePastePlugin } from './plugins/imagePaste.js';

export interface CreateEditorStateOptions {
  content?: string;
  saveImage?: SaveImageFn;
}

export function createEditorState(options: CreateEditorStateOptions = {}): EditorState {
  const { content = '', saveImage } = options;

  const doc = fromMarkdown(content);

  const plugins = [
    buildInputRules(),
    ...buildKeymaps(),
    history(),
    buildCursorRevealPlugin(),
    buildSyntaxHighlightPlugin(),
    columnResizing(),
    tableEditing(),
    dropCursor(),
    gapCursor(),
  ];

  if (saveImage) {
    plugins.push(buildImagePastePlugin(saveImage));
  }

  return EditorState.create({ doc, schema, plugins });
}

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
import type { GetSuggestions, GetTypeSuggestions } from './plugins/wikilink.js';
import { buildWikilinkPlugin, buildWikilinkValidationPlugin } from './plugins/wikilink.js';

export interface CreateEditorStateOptions {
  content?: string;
  saveImage?: SaveImageFn;
  getSuggestions?: GetSuggestions;
  getTypeSuggestions?: GetTypeSuggestions;
  isResolved?: (title: string) => boolean;
  onCreateNote?: (title: string) => void;
  onNavigate?: (title: string) => void;
}

export function createEditorState(options: CreateEditorStateOptions = {}): EditorState {
  const { content = '', saveImage, getSuggestions, getTypeSuggestions, isResolved, onCreateNote, onNavigate } = options;

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

  if (getSuggestions) {
    plugins.push(buildWikilinkPlugin(getSuggestions, schema, onCreateNote, getTypeSuggestions));
  }

  if (isResolved) {
    plugins.push(buildWikilinkValidationPlugin(isResolved, onCreateNote, onNavigate));
  }

  if (saveImage) {
    plugins.push(buildImagePastePlugin(saveImage));
  }

  return EditorState.create({ doc, schema, plugins });
}

export { schema } from './schema.js';
export { createEditorState } from './createEditorState.js';
export { fromMarkdown } from './serialization/fromMarkdown.js';
export { toMarkdown } from './serialization/toMarkdown.js';
export type { SaveImageFn } from './plugins/imagePaste.js';

// Re-export ProseMirror view so ui package doesn't need a direct dep
export { EditorView } from 'prosemirror-view';

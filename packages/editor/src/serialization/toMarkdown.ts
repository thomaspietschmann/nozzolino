import { defaultMarkdownSerializer } from 'prosemirror-markdown';
import type { Node } from 'prosemirror-model';

/**
 * Serialize a ProseMirror document node back to a Markdown string.
 */
export function toMarkdown(doc: Node): string {
  return defaultMarkdownSerializer.serialize(doc);
}

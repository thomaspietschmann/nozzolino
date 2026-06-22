import { defaultMarkdownParser } from 'prosemirror-markdown';
import type { Node } from 'prosemirror-model';

/**
 * Parse a Markdown string into a ProseMirror document node.
 * Uses the default prosemirror-markdown parser which handles
 * standard GFM-like syntax.
 */
export function fromMarkdown(markdown: string): Node {
  return defaultMarkdownParser.parse(markdown) as Node;
}

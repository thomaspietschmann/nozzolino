import { MarkdownSerializer, defaultMarkdownSerializer } from 'prosemirror-markdown';
import type { Node } from 'prosemirror-model';

const serializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,

    wikilink(state, node) {
      const { title, relationshipType } = node.attrs as {
        title: string;
        relationshipType: string | null;
      };
      state.write(`[[${title}${relationshipType ? `||${relationshipType}` : ''}]]`);
    },
  },
  defaultMarkdownSerializer.marks
);

/**
 * Serialize a ProseMirror document node back to a Markdown string.
 * Wikilink nodes are rendered as [[Title]] or [[Title||TYPE]].
 */
export function toMarkdown(doc: Node): string {
  return serializer.serialize(doc);
}

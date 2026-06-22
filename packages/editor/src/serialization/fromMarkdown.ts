import { MarkdownParser, defaultMarkdownParser } from 'prosemirror-markdown';
import { Fragment } from 'prosemirror-model';
import type { Node } from 'prosemirror-model';
import { schema } from '../schema.js';
import { WIKILINK_REGEX } from '@notes-app/common';

// prosemirror-state v1.4.4 derives state.schema from doc.type.schema rather
// than from the separate `schema` option passed to EditorState.create. Using
// a parser backed by our custom schema ensures the resulting doc carries the
// right schema and prosemirror-tables plugins can resolve their node types.
const markdownParser = new MarkdownParser(
  schema,
  defaultMarkdownParser.tokenizer,
  defaultMarkdownParser.tokens,
);

/**
 * Parse a Markdown string into a ProseMirror document node.
 * After the standard parse, text nodes matching [[Title]] or [[Title||TYPE]]
 * are replaced with inline wikilink nodes.
 *
 * A trailing empty paragraph is appended when the document does not already
 * end with one, ensuring there is always a text-insertion point below the
 * last block-level node (heading, code block, horizontal rule, etc.).
 */
export function fromMarkdown(markdown: string): Node {
  let baseDoc = markdownParser.parse(markdown) as Node;

  // Guarantee a trailing paragraph so users (and tests) can always position
  // the cursor below the last block-level element.
  const lastChild = baseDoc.lastChild;
  if (!lastChild || lastChild.type.name !== 'paragraph') {
    const emptyParagraph = schema.nodes['paragraph']!.create();
    baseDoc = baseDoc.copy(baseDoc.content.addToEnd(emptyParagraph));
  }

  const wikilinkType = schema.nodes['wikilink'];
  if (!wikilinkType) return baseDoc;
  return injectWikilinks(baseDoc);
}

function injectWikilinks(node: Node): Node {
  if (node.isLeaf || node.isAtom) return node;
  // Never convert [[…]] inside fenced code blocks or inline code spans.
  if (node.type.name === 'code_block') return node;

  const newChildren: Node[] = [];
  let changed = false;

  node.forEach((child) => {
    if (child.isText) {
      // Skip text that is styled as inline code.
      if (child.marks.some((m) => m.type.name === 'code')) {
        newChildren.push(child);
        return;
      }
      const text = child.text ?? '';
      const wikilinkRe = new RegExp(WIKILINK_REGEX.source, 'g');
      const parts: Node[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = wikilinkRe.exec(text)) !== null) {
        if (match.index > lastIndex) {
          parts.push(schema.text(text.slice(lastIndex, match.index), child.marks));
        }
        const title = (match[1] ?? '').trim();
        const rel = match[2] ? match[2].trim() : null;
        parts.push(
          schema.nodes['wikilink']!.create({ title, relationshipType: rel, resolved: true })
        );
        lastIndex = match.index + match[0].length;
      }

      if (parts.length > 0) {
        if (lastIndex < text.length) {
          parts.push(schema.text(text.slice(lastIndex), child.marks));
        }
        newChildren.push(...parts);
        changed = true;
        return;
      }
    } else {
      const transformed = injectWikilinks(child);
      if (transformed !== child) changed = true;
      newChildren.push(transformed);
      return;
    }
    newChildren.push(child);
  });

  if (!changed) return node;
  return node.copy(Fragment.from(newChildren));
}

import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { EditorState } from 'prosemirror-state';

const key = new PluginKey<DecorationSet>('cursorReveal');

/**
 * Typora-style cursor reveal: when the cursor sits inside a formatted span
 * (bold, italic, inline code, strikethrough), the span receives a CSS class
 * that reveals the Markdown syntax characters via ::before/::after pseudo-elements.
 *
 * The actual syntax chars (**, _, `, ~~) are shown purely in CSS so they never
 * enter the document model or the serialized Markdown.
 */
export function buildCursorRevealPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init(): DecorationSet {
        return DecorationSet.empty;
      },
      apply(tr, _old, _prevState, newState): DecorationSet {
        if (!tr.docChanged && !tr.selectionSet) return _old;
        return buildDecorations(newState);
      },
    },
    props: {
      decorations(state) {
        return key.getState(state) ?? DecorationSet.empty;
      },
    },
  });
}

function buildDecorations(state: EditorState): DecorationSet {
  const { $from } = state.selection;
  const decorations: Decoration[] = [];

  const markRevealMap: Record<string, string> = {
    strong: 'reveal-strong',
    em: 'reveal-em',
    code: 'reveal-code',
    strikethrough: 'reveal-strikethrough',
  };

  // Find all marks at the current cursor position and expand to their full range
  $from.marks().forEach((mark) => {
    const cls = markRevealMap[mark.type.name];
    if (!cls) return;

    // Walk the document to find the start/end of this mark range
    let from = $from.pos;
    let to = $from.pos;

    // Expand left
    const doc = state.doc;
    for (let pos = $from.pos - 1; pos >= $from.start(); pos--) {
      const node = doc.nodeAt(pos);
      if (node?.marks.some((m) => m.type === mark.type)) {
        from = pos;
      } else {
        break;
      }
    }

    // Expand right
    for (let pos = $from.pos; pos <= $from.end(); pos++) {
      const node = doc.nodeAt(pos);
      if (node?.marks.some((m) => m.type === mark.type)) {
        to = pos + (node.nodeSize ?? 1);
      } else {
        break;
      }
    }

    if (from < to) {
      decorations.push(
        Decoration.inline(from, to, {
          class: cls,
        })
      );
    }
  });

  return DecorationSet.create(state.doc, decorations);
}

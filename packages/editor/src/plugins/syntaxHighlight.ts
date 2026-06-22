import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import bash from 'highlight.js/lib/languages/bash';
import java from 'highlight.js/lib/languages/java';
import rust from 'highlight.js/lib/languages/rust';
import ruby from 'highlight.js/lib/languages/ruby';
import kotlin from 'highlight.js/lib/languages/kotlin';

// Register exactly the 7 languages from ADR-0003 / constants.ts
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('java', java);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('kotlin', kotlin);

const key = new PluginKey<DecorationSet>('syntaxHighlight');

export function buildSyntaxHighlightPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init(_config, state) {
        return highlightDoc(state.doc);
      },
      apply(tr, old) {
        if (!tr.docChanged) return old;
        return highlightDoc(tr.doc);
      },
    },
    props: {
      decorations(state) {
        return key.getState(state) ?? DecorationSet.empty;
      },
    },
  });
}

function highlightDoc(doc: import('prosemirror-model').Node): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return;
    const lang = (node.attrs as { language: string | null })['language'];
    if (!lang) return;

    const code = node.textContent;
    let highlighted: string;
    try {
      highlighted = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    } catch {
      return;
    }

    // Convert highlight.js HTML spans to ProseMirror inline decorations
    const tokens = parseHljsHtml(highlighted);
    let offset = 0;
    const contentStart = pos + 1; // +1 for the code_block node itself

    for (const token of tokens) {
      const from = contentStart + offset;
      const to = from + token.text.length;
      if (token.cls) {
        decorations.push(Decoration.inline(from, to, { class: `hljs-${token.cls}` }));
      }
      offset += token.text.length;
    }
  });

  return DecorationSet.create(doc, decorations);
}

interface HljsToken {
  text: string;
  cls: string | null;
}

function parseHljsHtml(html: string): HljsToken[] {
  const tokens: HljsToken[] = [];
  const spanRe = /<span class="([^"]+)">([^<]*)<\/span>|([^<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = spanRe.exec(html)) !== null) {
    if (match[3] !== undefined) {
      tokens.push({ text: unescapeHtml(match[3]), cls: null });
    } else if (match[1] !== undefined && match[2] !== undefined) {
      tokens.push({ text: unescapeHtml(match[2]), cls: match[1] });
    }
  }
  return tokens;
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

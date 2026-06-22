import { Schema } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';
import { wikilinkNodeSpec } from './plugins/wikilink.js';

const tableSchemaNodes = tableNodes({
  tableGroup: 'block',
  cellContent: 'block+',
  cellAttributes: {},
});

export const schema = new Schema({
  nodes: {
    doc: {
      content: 'block+',
    },

    paragraph: {
      group: 'block',
      content: 'inline*',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0];
      },
    },

    blockquote: {
      group: 'block',
      content: 'block+',
      defining: true,
      parseDOM: [{ tag: 'blockquote' }],
      toDOM() {
        return ['blockquote', 0];
      },
    },

    horizontal_rule: {
      group: 'block',
      parseDOM: [{ tag: 'hr' }],
      toDOM() {
        return ['hr'];
      },
    },

    heading: {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
      defining: true,
      parseDOM: [1, 2, 3, 4, 5, 6].map((i) => ({
        tag: `h${i}`,
        attrs: { level: i },
      })),
      toDOM(node) {
        return [`h${node.attrs['level'] as number}`, 0];
      },
    },

    code_block: {
      attrs: { language: { default: null } },
      content: 'text*',
      group: 'block',
      code: true,
      defining: true,
      parseDOM: [
        {
          tag: 'pre',
          preserveWhitespace: 'full',
          getAttrs(dom) {
            const code = (dom as HTMLElement).querySelector('code');
            const cls = code?.className ?? '';
            const lang = cls.replace(/^language-/, '') || null;
            return { language: lang };
          },
        },
      ],
      toDOM(node) {
        const lang = node.attrs['language'] as string | null;
        return ['pre', ['code', lang ? { class: `language-${lang}` } : {}, 0]];
      },
    },

    bullet_list: {
      group: 'block',
      content: 'list_item+',
      parseDOM: [{ tag: 'ul' }],
      toDOM() {
        return ['ul', 0];
      },
    },

    ordered_list: {
      attrs: { order: { default: 1 } },
      group: 'block',
      content: 'list_item+',
      parseDOM: [
        {
          tag: 'ol',
          getAttrs(dom) {
            return { order: parseInt((dom as HTMLElement).getAttribute('start') ?? '1', 10) };
          },
        },
      ],
      toDOM(node) {
        const order = node.attrs['order'] as number;
        return order === 1 ? ['ol', 0] : ['ol', { start: order }, 0];
      },
    },

    list_item: {
      content: 'paragraph block*',
      defining: true,
      parseDOM: [{ tag: 'li' }],
      toDOM() {
        return ['li', 0];
      },
    },

    text: {
      group: 'inline',
    },

    image: {
      inline: true,
      attrs: {
        src: {},
        alt: { default: null },
        title: { default: null },
      },
      group: 'inline',
      draggable: true,
      parseDOM: [
        {
          tag: 'img[src]',
          getAttrs(dom) {
            const el = dom as HTMLImageElement;
            return {
              src: el.getAttribute('src'),
              alt: el.getAttribute('alt'),
              title: el.getAttribute('title'),
            };
          },
        },
      ],
      toDOM(node) {
        const { src, alt, title } = node.attrs as {
          src: string;
          alt: string | null;
          title: string | null;
        };
        return ['img', { src, alt, title }];
      },
    },

    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM() {
        return ['br'];
      },
    },

    ...wikilinkNodeSpec(),
    ...tableSchemaNodes,
  },

  marks: {
    link: {
      attrs: {
        href: {},
        title: { default: null },
      },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs(dom) {
            return {
              href: (dom as HTMLAnchorElement).getAttribute('href'),
              title: (dom as HTMLAnchorElement).getAttribute('title'),
            };
          },
        },
      ],
      toDOM(node) {
        const { href, title } = node.attrs as { href: string; title: string | null };
        return ['a', { href, title }];
      },
    },

    em: {
      parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
      toDOM() {
        return ['em', 0];
      },
    },

    strong: {
      parseDOM: [
        { tag: 'strong' },
        {
          tag: 'b',
          getAttrs: (dom) => (dom as HTMLElement).style.fontWeight !== 'normal' && null,
        },
        {
          style: 'font-weight',
          getAttrs: (v) => (/^(bold(er)?|[5-9]\d{2,})$/.test(v as string) ? null : false),
        },
      ],
      toDOM() {
        return ['strong', 0];
      },
    },

    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM() {
        return ['code', 0];
      },
    },

    strikethrough: {
      parseDOM: [{ tag: 's' }, { tag: 'del' }, { style: 'text-decoration=line-through' }],
      toDOM() {
        return ['s', 0];
      },
    },
  },
});

export type AppSchema = typeof schema;

import { inputRules, wrappingInputRule, textblockTypeInputRule, InputRule } from 'prosemirror-inputrules';
import type { Plugin } from 'prosemirror-state';
import { schema } from '../schema.js';

function markInputRule(
  pattern: RegExp,
  markType: (typeof schema.marks)[string],
  getAttrs?: (match: RegExpMatchArray) => Record<string, unknown>
): InputRule {
  return new InputRule(pattern, (state, match, start, end) => {
    const attrs = getAttrs?.(match) ?? {};
    const mark = markType.create(attrs);
    const content = match[1] ?? '';
    const tr = state.tr.replaceWith(
      start,
      end,
      schema.text(content, [mark])
    );
    return tr;
  });
}

export function buildInputRules(): Plugin {
  return inputRules({
    rules: [
      // Headings: # ## ###
      textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes['heading']!, (match) => ({
        level: match[1]!.length,
      })),

      // Blockquote: >
      wrappingInputRule(/^\s*>\s$/, schema.nodes['blockquote']!),

      // Bullet list: - or * or +
      wrappingInputRule(/^\s*[-*+]\s$/, schema.nodes['bullet_list']!),

      // Ordered list: 1.
      wrappingInputRule(
        /^(\d+)\.\s$/,
        schema.nodes['ordered_list']!,
        (match) => ({ order: parseInt(match[1] ?? '1', 10) }),
        (match, node) => node.childCount + (node.attrs['order'] as number) === parseInt(match[1] ?? '1', 10)
      ),

      // Code block: ``` or ```lang
      textblockTypeInputRule(/^```(\w*)\s$/, schema.nodes['code_block']!, (match) => ({
        language: match[1] || null,
      })),

      // Horizontal rule: ---
      new InputRule(/^---$/, (state, _match, start, end) => {
        const hr = schema.nodes['horizontal_rule']!.create();
        return state.tr.replaceRangeWith(start, end, hr);
      }),

      // Bold: **text**
      markInputRule(/\*\*([^*]+)\*\*$/, schema.marks['strong']!),

      // Bold: __text__
      markInputRule(/__([^_]+)__$/, schema.marks['strong']!),

      // Italic: *text*
      markInputRule(/\*([^*]+)\*$/, schema.marks['em']!),

      // Italic: _text_
      markInputRule(/_([^_]+)_$/, schema.marks['em']!),

      // Inline code: `text`
      markInputRule(/`([^`]+)`$/, schema.marks['code']!),

      // Strikethrough: ~~text~~
      markInputRule(/~~([^~]+)~~$/, schema.marks['strikethrough']!),
    ],
  });
}

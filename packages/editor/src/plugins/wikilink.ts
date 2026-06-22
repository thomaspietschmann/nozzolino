import { Node as PmNode, Schema } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { EditorView } from 'prosemirror-view';
import type { EditorState, Transaction } from 'prosemirror-state';
import { WIKILINK_REGEX } from '@notes-app/common';

// ─── Schema extension ────────────────────────────────────────────────────────

export function wikilinkNodeSpec() {
  return {
    wikilink: {
      inline: true,
      group: 'inline',
      selectable: true,
      atom: true,
      attrs: {
        title: {},
        relationshipType: { default: null },
        resolved: { default: true },
      },
      parseDOM: [
        {
          tag: 'span[data-wikilink]',
          getAttrs(dom: HTMLElement) {
            return {
              title: dom.getAttribute('data-title') ?? '',
              relationshipType: dom.getAttribute('data-rel') ?? null,
              resolved: dom.getAttribute('data-resolved') !== 'false',
            };
          },
        },
      ],
      toDOM(node: PmNode): [string, Record<string, string>, string] {
        const { title, relationshipType, resolved } = node.attrs as {
          title: string;
          relationshipType: string | null;
          resolved: boolean;
        };
        return [
          'span',
          {
            'data-wikilink': '',
            'data-title': title,
            'data-rel': relationshipType ?? '',
            'data-resolved': resolved ? 'true' : 'false',
            class: `wikilink ${resolved ? '' : 'wikilink--unresolved'}`.trim(),
          },
          `[[${title}${relationshipType ? `||${relationshipType}` : ''}]]`,
        ];
      },
    },
  };
}

// ─── Autocomplete plugin ─────────────────────────────────────────────────────

export interface WikilinkSuggestion {
  title: string;
  emoji: string | null;
}

export type GetSuggestions = (query: string) => WikilinkSuggestion[];

interface AutocompleteState {
  active: boolean;
  query: string;
  triggerPos: number;
  selectedIndex: number;
}

const autocompleteKey = new PluginKey<AutocompleteState>('wikilinkAutocomplete');

function getAutocompleteState(state: EditorState): AutocompleteState {
  return (
    autocompleteKey.getState(state) ?? {
      active: false,
      query: '',
      triggerPos: -1,
      selectedIndex: 0,
    }
  );
}

export function buildWikilinkPlugin(
  getSuggestions: GetSuggestions,
  schema: Schema,
  onCreateNote?: (title: string) => void
): Plugin<AutocompleteState> {
  return new Plugin<AutocompleteState>({
    key: autocompleteKey,

    state: {
      init(): AutocompleteState {
        return { active: false, query: '', triggerPos: -1, selectedIndex: 0 };
      },
      apply(tr: Transaction, prev: AutocompleteState): AutocompleteState {
        const meta = tr.getMeta(autocompleteKey) as AutocompleteState | undefined;
        if (meta !== undefined) return meta;
        // If selection moved outside trigger range, deactivate
        if (prev.active && tr.selectionSet) {
          const { $from } = tr.selection;
          const text = $from.parent.textBetween(0, $from.parentOffset, '\n');
          const match = /\[\[([^\]|]*)$/.exec(text);
          if (!match) {
            return { active: false, query: '', triggerPos: -1, selectedIndex: 0 };
          }
          return { ...prev, query: match[1] ?? '', selectedIndex: 0 };
        }
        return prev;
      },
    },

    props: {
      handleTextInput(view: EditorView, _from: number, _to: number, text: string): boolean {
        const state = view.state;
        const { $from } = state.selection;
        const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\n') + text;

        // Detect opening [[
        const triggerMatch = /\[\[([^\]|]*)$/.exec(textBefore);
        if (triggerMatch) {
          const query = triggerMatch[1] ?? '';
          const tr = state.tr.setMeta(autocompleteKey, {
            active: true,
            query,
            triggerPos: $from.pos - query.length,
            selectedIndex: 0,
          });
          view.dispatch(tr);
          return false; // let PM handle the actual text insert
        }

        // Deactivate on ]]
        if (text === ']') {
          const current = getAutocompleteState(state);
          if (current.active) {
            // Check if we just closed the wikilink
            const before = $from.parent.textBetween(0, $from.parentOffset, '\n');
            if (before.endsWith(']')) {
              // Both closing brackets typed — parse and replace with node
              const fullText = before + ']';
              const match = WIKILINK_REGEX.exec(fullText.slice(fullText.lastIndexOf('[[')));
              if (match) {
                const title = match[1]?.trim() ?? '';
                const rel = match[2]?.trim() ?? null;
                if (title) {
                  insertWikilinkNode(view, title, rel, schema, current.triggerPos);
                }
              }
            }
          }
        }
        return false;
      },

      handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
        const ac = getAutocompleteState(view.state);
        if (!ac.active) return false;

        const suggestions = getSuggestions(ac.query);
        if (suggestions.length === 0) return false;

        if (event.key === 'ArrowDown') {
          view.dispatch(
            view.state.tr.setMeta(autocompleteKey, {
              ...ac,
              selectedIndex: (ac.selectedIndex + 1) % suggestions.length,
            })
          );
          return true;
        }
        if (event.key === 'ArrowUp') {
          view.dispatch(
            view.state.tr.setMeta(autocompleteKey, {
              ...ac,
              selectedIndex: (ac.selectedIndex - 1 + suggestions.length) % suggestions.length,
            })
          );
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const suggestion = suggestions[ac.selectedIndex];
          if (suggestion) {
            insertWikilinkNode(view, suggestion.title, null, schema, ac.triggerPos);
          }
          return true;
        }
        if (event.key === 'Escape') {
          view.dispatch(
            view.state.tr.setMeta(autocompleteKey, {
              active: false,
              query: '',
              triggerPos: -1,
              selectedIndex: 0,
            })
          );
          return true;
        }
        return false;
      },

      decorations(state: EditorState): DecorationSet {
        const ac = autocompleteKey.getState(state);
        if (!ac?.active) return DecorationSet.empty;

        const { $from } = state.selection;
        const from = Math.max(0, $from.pos - 2 - ac.query.length);
        const to = $from.pos;
        if (from >= to) return DecorationSet.empty;

        return DecorationSet.create(state.doc, [
          Decoration.inline(from, to, { class: 'wikilink-trigger' }),
        ]);
      },
    },

    view(editorView: EditorView) {
      let dropdownEl: HTMLDivElement | null = null;

      function renderDropdown() {
        const ac = getAutocompleteState(editorView.state);
        if (!ac.active) {
          dropdownEl?.remove();
          dropdownEl = null;
          return;
        }

        const suggestions = getSuggestions(ac.query);
        if (suggestions.length === 0 && ac.query.length === 0) {
          dropdownEl?.remove();
          dropdownEl = null;
          return;
        }

        if (!dropdownEl) {
          dropdownEl = document.createElement('div');
          dropdownEl.className = 'wikilink-dropdown';
          document.body.appendChild(dropdownEl);
        }

        // Position below cursor
        const { from } = editorView.state.selection;
        const coords = editorView.coordsAtPos(from);
        dropdownEl.style.position = 'fixed';
        dropdownEl.style.left = `${coords.left}px`;
        dropdownEl.style.top = `${coords.bottom + 4}px`;
        dropdownEl.style.zIndex = '1000';

        const items = suggestions.map((s, i) => {
          const el = document.createElement('button');
          el.className = `wikilink-dropdown__item${i === ac.selectedIndex ? ' is-selected' : ''}`;
          el.textContent = (s.emoji ? s.emoji + ' ' : '') + s.title;
          el.addEventListener('mousedown', (e) => {
            e.preventDefault();
            insertWikilinkNode(editorView, s.title, null, editorView.state.schema, ac.triggerPos);
          });
          return el;
        });

        // "Create note" option when query has content and no exact match
        const exactMatch = suggestions.some(
          (s) => s.title.toLowerCase() === ac.query.toLowerCase()
        );
        if (ac.query && !exactMatch && onCreateNote) {
          const el = document.createElement('button');
          el.className = 'wikilink-dropdown__item wikilink-dropdown__item--create';
          el.textContent = `Create "${ac.query}"`;
          el.addEventListener('mousedown', (e) => {
            e.preventDefault();
            onCreateNote(ac.query);
            insertWikilinkNode(editorView, ac.query, null, editorView.state.schema, ac.triggerPos);
          });
          items.push(el);
        }

        dropdownEl.replaceChildren(...items);
      }

      return {
        update: renderDropdown,
        destroy() {
          dropdownEl?.remove();
        },
      };
    },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function insertWikilinkNode(
  view: EditorView,
  title: string,
  relationshipType: string | null,
  schema: Schema,
  triggerPos: number
): void {
  const { state } = view;
  const { $from } = state.selection;

  // Delete from [[ back to current position
  const from = triggerPos;
  const to = $from.pos;

  const wikilinkType = schema.nodes['wikilink'];
  if (!wikilinkType) return;

  const node = wikilinkType.create({ title, relationshipType, resolved: true });
  const tr = state.tr
    .delete(from, to)
    .insert(from, node)
    .setMeta(autocompleteKey, {
      active: false,
      query: '',
      triggerPos: -1,
      selectedIndex: 0,
    });

  view.dispatch(tr);
}

// ─── Unresolved link decoration plugin ───────────────────────────────────────

export function buildWikilinkValidationPlugin(
  isResolved: (title: string) => boolean
): Plugin<DecorationSet> {
  const key = new PluginKey<DecorationSet>('wikilinkValidation');

  return new Plugin<DecorationSet>({
    key,
    state: {
      init(_cfg, state) {
        return buildValidationDecorations(state.doc, isResolved);
      },
      apply(tr, old) {
        if (!tr.docChanged) return old;
        return buildValidationDecorations(tr.doc, isResolved);
      },
    },
    props: {
      decorations(state) {
        return key.getState(state) ?? DecorationSet.empty;
      },
    },
  });
}

function buildValidationDecorations(
  doc: PmNode,
  isResolved: (title: string) => boolean
): DecorationSet {
  const decos: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === 'wikilink') {
      const title = (node.attrs as { title: string }).title;
      if (!isResolved(title)) {
        decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'wikilink--unresolved' }));
      }
    }
  });

  return DecorationSet.create(doc, decos);
}

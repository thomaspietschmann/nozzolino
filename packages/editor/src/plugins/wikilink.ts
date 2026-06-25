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
export type GetTypeSuggestions = (query: string) => string[];

/** Two distinct phases of the autocomplete flow. */
type AutocompleteMode = 'title' | 'type';

interface AutocompleteState {
  active: boolean;
  mode: AutocompleteMode;
  /** For title mode: the partial title text; for type mode: the partial rel type. */
  query: string;
  /** Partial title accumulated before '||' (only set when mode === 'type'). */
  titleSoFar: string;
  triggerPos: number;
  selectedIndex: number;
}

const autocompleteKey = new PluginKey<AutocompleteState>('wikilinkAutocomplete');

const INACTIVE_AC: AutocompleteState = {
  active: false,
  mode: 'title',
  query: '',
  titleSoFar: '',
  triggerPos: -1,
  selectedIndex: 0,
};

function getAutocompleteState(state: EditorState): AutocompleteState {
  return autocompleteKey.getState(state) ?? INACTIVE_AC;
}

export function buildWikilinkPlugin(
  getSuggestions: GetSuggestions,
  schema: Schema,
  onCreateNote?: (title: string) => void,
  getTypeSuggestions?: GetTypeSuggestions
): Plugin<AutocompleteState> {
  return new Plugin<AutocompleteState>({
    key: autocompleteKey,

    state: {
      init(): AutocompleteState {
        return INACTIVE_AC;
      },
      apply(tr: Transaction, prev: AutocompleteState): AutocompleteState {
        const meta = tr.getMeta(autocompleteKey) as AutocompleteState | undefined;
        if (meta !== undefined) return meta;
        // Re-derive state from text when selection moves (e.g. arrow keys).
        if (prev.active && tr.selectionSet) {
          const { $from } = tr.selection;
          const text = $from.parent.textBetween(0, $from.parentOffset, '\n');

          // Check for type mode: [[Title||partialType
          const typeMatch = /\[\[([^\]|]+)\|\|([^\]]*)$/.exec(text);
          if (typeMatch) {
            return {
              ...prev,
              mode: 'type',
              query: typeMatch[2] ?? '',
              titleSoFar: typeMatch[1] ?? '',
              selectedIndex: 0,
            };
          }
          // Check for title mode: [[partialTitle
          const titleMatch = /\[\[([^\]|]*)$/.exec(text);
          if (!titleMatch) return INACTIVE_AC;
          return { ...prev, mode: 'title', query: titleMatch[1] ?? '', selectedIndex: 0 };
        }
        return prev;
      },
    },

    props: {
      handleTextInput(view: EditorView, _from: number, _to: number, text: string): boolean {
        const state = view.state;
        const { $from } = state.selection;
        const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\n') + text;
        const current = getAutocompleteState(state);

        // Detect switch to type mode: active title autocomplete + user typed '|'
        if (current.active && current.mode === 'title' && textBefore.match(/\[\[([^\]|]+)\|$/)) {
          // Wait for the second '|' before switching (typed text so far ends with one '|')
          return false;
        }
        if (current.active && current.mode === 'title' && textBefore.match(/\[\[([^\]|]+)\|\|$/)) {
          const titleMatch = /\[\[([^\]|]+)\|\|$/.exec(textBefore);
          const tr = state.tr.setMeta(autocompleteKey, {
            ...current,
            active: true,
            mode: 'type',
            query: '',
            titleSoFar: titleMatch?.[1]?.trim() ?? current.query,
            selectedIndex: 0,
          });
          view.dispatch(tr);
          return false;
        }

        // While in type mode, keep updating the query
        if (current.active && current.mode === 'type') {
          const typeMatch = /\[\[([^\]|]+)\|\|([^\]]*)$/.exec(textBefore);
          if (typeMatch) {
            const tr = state.tr.setMeta(autocompleteKey, {
              ...current,
              query: typeMatch[2] ?? '',
              selectedIndex: 0,
            });
            view.dispatch(tr);
          } else {
            view.dispatch(state.tr.setMeta(autocompleteKey, INACTIVE_AC));
          }
          return false;
        }

        // Detect opening [[
        const triggerMatch = /\[\[([^\]|]*)$/.exec(textBefore);
        if (triggerMatch) {
          const query = triggerMatch[1] ?? '';
          const tr = state.tr.setMeta(autocompleteKey, {
            active: true,
            mode: 'title',
            query,
            titleSoFar: '',
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
              // Both closing brackets typed — parse and replace with node.
              // Return true to consume this ']' so ProseMirror does not append
              // a stray bracket after the wikilink node.
              const fullText = before + ']';
              const match = WIKILINK_REGEX.exec(fullText.slice(fullText.lastIndexOf('[[')));
              if (match) {
                const title = match[1]?.trim() ?? '';
                const rel = match[2]?.trim() ?? null;
                if (title) {
                  insertWikilinkNode(view, title, rel, schema, current.triggerPos);
                  return true;
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

        const suggestions =
          ac.mode === 'type'
            ? (getTypeSuggestions?.(ac.query) ?? [])
            : getSuggestions(ac.query).map((s) => s.title);
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
          const chosen = suggestions[ac.selectedIndex];
          if (chosen) {
            if (ac.mode === 'type') {
              insertWikilinkNode(view, ac.titleSoFar, chosen, schema, ac.triggerPos);
            } else {
              const titleSuggestions = getSuggestions(ac.query);
              const s = titleSuggestions[ac.selectedIndex];
              if (s) insertWikilinkNode(view, s.title, null, schema, ac.triggerPos);
            }
          }
          return true;
        }
        if (event.key === 'Escape') {
          view.dispatch(view.state.tr.setMeta(autocompleteKey, INACTIVE_AC));
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

        const isTypeMode = ac.mode === 'type';
        const typeSuggestions = isTypeMode ? (getTypeSuggestions?.(ac.query) ?? []) : [];
        const titleSuggestions = isTypeMode ? [] : getSuggestions(ac.query);

        const totalSuggestions = isTypeMode ? typeSuggestions.length : titleSuggestions.length;
        if (totalSuggestions === 0 && ac.query.length === 0 && !(!isTypeMode && onCreateNote)) {
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

        let items: HTMLElement[];

        if (isTypeMode) {
          items = typeSuggestions.map((t, i) => {
            const el = document.createElement('button');
            el.className = `wikilink-dropdown__item${i === ac.selectedIndex ? ' is-selected' : ''}`;
            el.textContent = t;
            el.addEventListener('mousedown', (e) => {
              e.preventDefault();
              insertWikilinkNode(editorView, ac.titleSoFar, t, editorView.state.schema, ac.triggerPos);
            });
            return el;
          });
        } else {
          items = titleSuggestions.map((s, i) => {
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
          const exactMatch = titleSuggestions.some(
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
  _triggerPos: number
): void {
  const { state } = view;
  const { $from } = state.selection;

  // Recompute the delete range at insert time by scanning back to the last '[[' in
  // the current text. This is more robust than trusting the stored triggerPos, which
  // points after the '[[' brackets (off-by-two bug when typed via handleTextInput).
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\n');
  const bracketIdx = textBefore.lastIndexOf('[[');
  const from =
    bracketIdx === -1
      ? $from.pos - $from.parentOffset // fallback: start of block
      : $from.pos - ($from.parentOffset - bracketIdx);
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
  isResolved: (title: string) => boolean,
  onCreateNote?: (title: string) => void,
  onNavigate?: (title: string) => void
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
      // Click on a wikilink: resolved → navigate to the target note;
      // unresolved → create it.
      handleClickOn(_view, _pos, node, _nodePos, _event, _direct) {
        if (node.type.name !== 'wikilink') return false;
        const title = (node.attrs as { title: string; resolved: boolean }).title;
        const resolved = (node.attrs as { resolved: boolean }).resolved;
        if (resolved && onNavigate) {
          onNavigate(title);
          return true;
        }
        if (!resolved && onCreateNote) {
          onCreateNote(title);
          return true;
        }
        return false;
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

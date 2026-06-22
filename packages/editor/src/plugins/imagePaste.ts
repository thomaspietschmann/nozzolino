import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { schema } from '../schema.js';

export type SaveImageFn = (blob: Blob, ext: string) => Promise<string>;

/**
 * Intercepts paste events that contain image data.
 * Calls `saveImage(blob, ext)` which should persist the image and return
 * a path (relative to the vault root, using the sibling folder convention
 * from ADR-0005), then inserts an image node into the document.
 */
export function buildImagePastePlugin(saveImage: SaveImageFn): Plugin {
  return new Plugin({
    props: {
      handlePaste(view: EditorView, event: ClipboardEvent): boolean {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of Array.from(items)) {
          if (!item.type.startsWith('image/')) continue;
          const blob = item.getAsFile();
          if (!blob) continue;

          event.preventDefault();
          const ext = item.type.split('/')[1] ?? 'png';

          saveImage(blob, ext)
            .then((src) => {
              const node = schema.nodes['image']!.create({ src, alt: '' });
              const tr = view.state.tr.replaceSelectionWith(node);
              view.dispatch(tr);
            })
            .catch(console.error);

          return true;
        }
        return false;
      },
    },
  });
}

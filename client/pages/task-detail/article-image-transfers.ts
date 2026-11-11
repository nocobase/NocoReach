import { Extension, type Editor } from '@tiptap/core';
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';

// How an image comes to be the article's own in the body editor (2026-11-12 user report: pasted images broke after a
// refresh). One from a file is shown from the file while it uploads; one pasted from another site (a web page, Feishu,
// WeChat, Notion) is shown from its address while the server copies it. Either is the article's task image once
// stored, and taken out with a message when that fails, so the body never keeps an address that stops working. Until
// then the image carries its transfer's id (`transfer`), the body is not handed back, and an undo or redo meanwhile
// is put right as soon as the transfer ends.

/** An image's way into the article: uploading its file, or copying it from its address. */
export type Transfer = {
  state: 'proposed' | 'running' | 'done' | 'failed';
  /** Stores the image; the task image address the article keeps for it. */
  run: () => Promise<string>;
  /** What the person is told when it fails. */
  problem: string;
  /** The file's local address, let go once the transfer ends. */
  local?: string;
  ref?: string;
};

/** The transfer of an image pasted from elsewhere, until the editor decides on it (`transformPasted`). */
export const PASTED = 'pasted';

const isImage = (node: PMNode) => node.type.name === 'image';
const transferOf = (node: PMNode) =>
  isImage(node) && typeof node.attrs.transfer === 'string'
    ? node.attrs.transfer
    : null;

/**
 * Pasted HTML with each image that is not the editor's own copy (which names the article's address, `data-nr-src`)
 * marked as pasted. A lazily loaded image (WeChat's `data-src`) is given the address it would have loaded.
 */
export function markPasted(html: string): string {
  if (!/<img\b/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const images = doc.querySelectorAll('img:not([data-nr-src])');
  if (!images.length) return html;
  for (const img of images) {
    img.setAttribute('data-nr-transfer', PASTED);
    const lazy =
      img.getAttribute('data-src') || img.getAttribute('data-original');
    if (
      lazy &&
      /^(https?:)?\/\//i.test(lazy) &&
      !/^https?:/i.test(img.getAttribute('src') || '')
    )
      img.setAttribute('src', lazy);
  }
  return doc.body.innerHTML;
}

/** Whether pasted HTML holds any text, rather than only an image (Copy image in a browser). */
export function hasText(html: string): boolean {
  return Boolean(
    new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim(),
  );
}

/** The slice with each image's attributes as `decide` gives them (none: as it is). */
export function mapImages(
  slice: Slice,
  decide: (node: PMNode) => Record<string, unknown> | null,
): Slice {
  const map = (fragment: Fragment): Fragment => {
    let changed = false;
    const nodes: PMNode[] = [];
    fragment.forEach((child) => {
      let next = child;
      if (isImage(child)) {
        const attrs = decide(child);
        if (attrs)
          next = child.type.create(
            { ...child.attrs, ...attrs },
            null,
            child.marks,
          );
      } else if (child.childCount) {
        const content = map(child.content);
        if (content !== child.content) next = child.copy(content);
      }
      changed ||= next !== child;
      nodes.push(next);
    });
    return changed ? Fragment.fromArray(nodes) : fragment;
  };
  const content = map(slice.content);
  return content === slice.content
    ? slice
    : new Slice(content, slice.openStart, slice.openEnd);
}

/** Whether an image in the document is still on its way in: the body is not the article's yet. */
export function waiting(doc: PMNode): boolean {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (transferOf(node)) found = true;
    return !isImage(node);
  });
  return found;
}

/**
 * The images whose transfer ended, put right: at the stored address, or taken out when it failed. Not a step to
 * undo; null when there is nothing to put right.
 */
export function settled(
  state: EditorState,
  transfers: ReadonlyMap<string, Transfer>,
): Transaction | null {
  const tr = state.tr;
  const failed: { from: number; to: number }[] = [];
  state.doc.descendants((node, pos) => {
    const id = transferOf(node);
    if (!id) return !isImage(node);
    const t = transfers.get(id);
    if (t?.state === 'done' && t.ref) {
      tr.setNodeAttribute(pos, 'src', t.ref);
      tr.setNodeAttribute(pos, 'transfer', null);
    } else if (t?.state === 'failed')
      failed.push({ from: pos, to: pos + node.nodeSize });
    // Not one of this editor's (none should be left): kept, as an image like any other.
    else if (!t) tr.setNodeAttribute(pos, 'transfer', null);
    return false;
  });
  for (const { from, to } of failed.reverse()) tr.delete(from, to);
  return tr.docChanged ? tr.setMeta('addToHistory', false) : null;
}

export type ImageTransfersOptions = {
  transfers: Map<string, Transfer>;
  /** A proposed transfer whose image is now in the document: started. */
  start: (editor: Editor, id: string) => void;
  /** A pasted image's attributes: kept as it is, pointed at the task image it is, or given a transfer. */
  decide: (node: PMNode) => Record<string, unknown> | null;
  /** A paste the editor takes itself (image files); false leaves it to ProseMirror. */
  paste: (editor: Editor, event: ClipboardEvent) => boolean;
};

const transfersKey = new PluginKey('nrImageTransfers');

export const ImageTransfers = Extension.create<ImageTransfersOptions>({
  name: 'nrImageTransfers',
  addOptions: () => ({
    transfers: new Map(),
    start: () => {},
    decide: () => null,
    paste: () => false,
  }),
  addProseMirrorPlugins() {
    const { editor, options } = this;
    return [
      new Plugin({
        key: transfersKey,
        props: {
          transformPastedHTML: (html) => markPasted(html),
          transformPasted: (slice) => mapImages(slice, options.decide),
          handlePaste: (_view, event) => options.paste(editor, event),
        },
        appendTransaction: (trs, _old, state) =>
          trs.some((tr) => tr.docChanged)
            ? settled(state, options.transfers)
            : null,
        view: () => ({
          update: (view, prev) => {
            if (view.state.doc === prev.doc) return;
            view.state.doc.descendants((node) => {
              const id = transferOf(node);
              if (id && options.transfers.get(id)?.state === 'proposed')
                options.start(editor, id);
              return !isImage(node);
            });
          },
        }),
      }),
    ];
  },
});

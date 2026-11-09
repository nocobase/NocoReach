import { Extension, type Editor } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// What a rewrite with AI shows in the article body (inline-rewrite.tsx): the selection while it is being asked about,
// then the old text struck through and the answer after it, and room under them for the bar, drawn as decorations so
// the document itself is unchanged until Accept.

/** What the editor asks of the page for a rewrite: the model's answer as it streams, and word of an accepted one. */
export type RewriteHost = {
  stream: (
    request: {
      selection: string;
      instruction: string;
      history: { instruction: string; result: string }[];
    },
    signal: AbortSignal,
  ) => AsyncIterable<string>;
  onAccepted: () => void;
};

export type Phase = 'ask' | 'stream' | 'result';
/** The selection being rewritten and what the decorations show of it. */
export type Marks = {
  from: number;
  to: number;
  /** Whole blocks (a selection across paragraphs) rather than words within one. */
  block: boolean;
  phase: Phase;
  text: string;
} | null;

export const rewriteKey = new PluginKey<Marks>('nrRewrite');

/** The answer as the editor would show it: parsed Markdown, inline content for words within a paragraph. */
export function answerContent(editor: Editor, text: string, block: boolean) {
  const nodes = editor.markdown?.parse(text).content ?? [];
  if (!block && nodes.length === 1 && nodes[0].type === 'paragraph')
    return { inline: true, content: nodes[0].content ?? [] };
  return { inline: false, content: nodes };
}

function answerDom(editor: Editor, marks: NonNullable<Marks>) {
  const { inline, content } = answerContent(editor, marks.text, marks.block);
  const element = document.createElement(inline ? 'span' : 'div');
  element.className = inline ? 'nr-rewrite-new' : 'nr-rewrite-new-block';
  element.dataset.rewriteNew = '';
  element.contentEditable = 'false';
  try {
    const doc = editor.schema.nodeFromJSON({
      type: 'doc',
      content: inline ? [{ type: 'paragraph', content }] : content,
    });
    const serializer = DOMSerializer.fromSchema(editor.schema);
    element.append(
      serializer.serializeFragment(
        inline ? doc.firstChild!.content : doc.content,
      ),
    );
  } catch {
    element.textContent = marks.text;
  }
  if (marks.phase === 'stream') {
    // At the end of the text written so far: inside the last block, not on a line of its own under it.
    const caret = document.createElement('span');
    caret.className = 'nr-rewrite-caret';
    let last: Element = element;
    while (last.lastElementChild && !last.lastElementChild.matches('img, br'))
      last = last.lastElementChild;
    last.append(caret);
  }
  return element;
}

function decorations(editor: Editor, state: EditorState, marks: Marks) {
  if (!marks) return DecorationSet.empty;
  const { from, to, phase } = marks;
  const list: Decoration[] = [];
  if (marks.block && phase !== 'ask')
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (pos >= from && pos + node.nodeSize <= to)
        list.push(
          Decoration.node(pos, pos + node.nodeSize, {
            class: 'nr-rewrite-old-block',
          }),
        );
      return false;
    });
  list.push(
    Decoration.inline(from, to, {
      class: phase === 'ask' ? 'nr-rewrite-picked' : 'nr-rewrite-old',
    }),
  );
  if (phase !== 'ask' && marks.text)
    list.push(
      Decoration.widget(to, () => answerDom(editor, marks), {
        side: 1,
        // A new key for each piece streamed, so the widget is drawn again.
        key: `rewrite:${phase}:${marks.text.length}:${marks.text.slice(-24)}`,
        ignoreSelection: true,
      }),
    );
  // The bar's room, after the new block or the paragraph the words are in, so the text after them moves down.
  const $to = state.doc.resolve(to);
  list.push(
    Decoration.widget(marks.block || !$to.depth ? to : $to.after(), room, {
      side: 2,
      key: 'rewrite-room',
      ignoreSelection: true,
    }),
  );
  return DecorationSet.create(state.doc, list);
}

/** As tall as the bar (inline-rewrite.tsx sets `--nr-rewrite-room` on the editor's frame). */
function room() {
  const element = document.createElement('div');
  element.className = 'nr-rewrite-room';
  element.dataset.rewriteRoom = '';
  element.contentEditable = 'false';
  element.setAttribute('aria-hidden', 'true');
  return element;
}

/** The decorations, and ⌘J to start a rewrite of the selection. */
export const InlineRewriteMarks = Extension.create<{ start: () => void }>({
  name: 'nrRewrite',
  addOptions: () => ({ start: () => {} }),
  addKeyboardShortcuts() {
    return {
      'Mod-j': () => {
        this.options.start();
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin<Marks>({
        key: rewriteKey,
        state: {
          init: () => null,
          apply(tr, marks) {
            const meta = tr.getMeta(rewriteKey) as { set: Marks } | undefined;
            if (meta) return meta.set;
            if (!marks || !tr.docChanged) return marks;
            return {
              ...marks,
              from: tr.mapping.map(marks.from, 1),
              to: tr.mapping.map(marks.to, -1),
            };
          },
        },
        props: {
          decorations(state) {
            return decorations(
              editor,
              state,
              rewriteKey.getState(state) ?? null,
            );
          },
        },
      }),
    ];
  },
});

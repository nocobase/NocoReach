import type { Editor, JSONContent } from '@tiptap/core';

// The article body edited as it reads (2026-11-04 user request) is still kept as the Markdown the target publishes.
// Writing the whole document back from the editor would re-space every table and list and drop what the editor cannot
// show (HTML, front matter), so every block the person did not touch is written back exactly as it was read, and only
// the changed blocks are written from the editor.

/** A top-level block of the Markdown read: its source, with the blank lines after it, and what the editor made of it. */
type Segment = { raw: string; key: string; size: number };
export type MarkdownSource = { segments: Segment[]; text: string };

const keyOf = (nodes: JSONContent[]) => JSON.stringify(nodes);

/** The Markdown split into blocks as the editor's own parser reads it. */
export function readMarkdown(editor: Editor, text: string): MarkdownSource {
  const manager = editor.markdown!;
  const { Lexer, defaults } = manager.instance;
  const tokens = new Lexer(defaults).lex(text);
  const segments: Segment[] = [];
  // Blank lines and blocks the editor shows nothing for (HTML comments, for one) go with the block after them.
  let pending = '';
  for (const token of tokens) {
    if (token.type === 'space') {
      if (segments.length) segments[segments.length - 1].raw += token.raw;
      else pending += token.raw;
      continue;
    }
    // As the document holds them, every attribute filled in, so they compare with its blocks.
    const parsed: JSONContent[] =
      manager.parse(token.raw.trimEnd()).content ?? [];
    const nodes = parsed.map(
      (n) => editor.schema.nodeFromJSON(n).toJSON() as JSONContent,
    );
    if (!nodes.length) {
      pending += token.raw;
      continue;
    }
    segments.push({
      raw: pending + token.raw,
      key: keyOf(nodes),
      size: nodes.length,
    });
    pending = '';
  }
  // Whatever is left after the last block stays at the end.
  if (pending) {
    if (segments.length) segments[segments.length - 1].raw += pending;
    else segments.push({ raw: pending, key: '[]', size: 0 });
  }
  return { segments, text };
}

/**
 * The document as Markdown, keeping the source of every block that is unchanged from `source` (matched in order, as
 * a line diff would) and writing the rest from the editor.
 */
export function writeMarkdown(editor: Editor, source: MarkdownSource): string {
  const manager = editor.markdown!;
  const nodes = (editor.state.doc.toJSON() as JSONContent).content ?? [];
  const keys = nodes.map((n) => keyOf([n]));
  const { segments } = source;
  const n = segments.length,
    m = nodes.length;
  // The longest run of source blocks kept, counted from the end: best[i][j] for segments i… and nodes j….
  const best = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  const matches = (i: number, j: number) => {
    const s = segments[i];
    if (!s.size || j + s.size > m) return false;
    return s.size === 1
      ? s.key === keys[j]
      : s.key === keyOf(nodes.slice(j, j + s.size));
  };
  for (let i = n - 1; i >= 0; i--)
    for (let j = m; j >= 0; j--) {
      let v = Math.max(best[i + 1][j], j < m ? best[i][j + 1] : 0);
      if (matches(i, j)) v = Math.max(v, best[i + 1][j + segments[i].size] + 1);
      best[i][j] = v;
    }
  let out = '';
  let fresh: JSONContent[] = [];
  const flush = () => {
    if (!fresh.length) return;
    if (out && !out.endsWith('\n\n')) out += out.endsWith('\n') ? '\n' : '\n\n';
    out += `${manager.serialize({ type: 'doc', content: fresh })}\n\n`;
    fresh = [];
  };
  let i = 0,
    j = 0;
  while (i < n || j < m) {
    if (
      i < n &&
      matches(i, j) &&
      best[i][j] === best[i + 1][j + segments[i].size] + 1
    ) {
      flush();
      out += segments[i].raw;
      j += segments[i].size;
      i++;
    } else if (i < n && (j === m || best[i][j] === best[i + 1][j])) {
      // A block the editor no longer has: dropped, unless it showed nothing (it cannot have been deleted).
      if (!segments[i].size) out += segments[i].raw;
      i++;
    } else {
      fresh.push(nodes[j]);
      j++;
    }
  }
  flush();
  // The source's own ending: a final newline or none.
  const ending = /\s*$/.exec(source.text)![0];
  return out.replace(/\s*$/, '') + ending;
}

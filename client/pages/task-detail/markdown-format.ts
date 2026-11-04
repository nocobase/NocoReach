// Formatting in a Markdown text box, from the keyboard (2026-11-04 user request, as GitHub's comment box) and from the
// editor's toolbar (2026-11-04 user request, as dev.to's editor). Bold, italic and code wrap the selection, or write the
// marks with the cursor between them, and the same button or key takes them off again; italic is `*`, not `_`, since
// `_` does not mark words inside Chinese or Japanese text. Heading, quote and the lists prefix the selected lines, and
// pressing again takes the prefix off; the heading goes ## → ### → none.

export type MarkdownStyle =
  | 'bold'
  | 'italic'
  | 'link'
  | 'code'
  | 'heading'
  | 'quote'
  | 'bulleted'
  | 'numbered';
/** Replace `from`–`to` with `text`, then select `select` in the new value. */
export type MarkdownEdit = {
  from: number;
  to: number;
  text: string;
  select: [number, number];
};

/** How many `mark` characters stand together going back from (`step` -1) or on from (`step` 1) `at`. */
function count(value: string, at: number, step: -1 | 1, mark: string) {
  let n = 0;
  while (value[step < 0 ? at - 1 - n : at + n] === mark) n++;
  return n;
}
/** Whether `n` marks on each side make the style: `**` bold, `*` italic, `***` both; any backticks code. */
const marks = (style: 'bold' | 'italic' | 'code', n: number) =>
  style === 'bold' ? n >= 2 : style === 'italic' ? n === 1 || n >= 3 : n >= 1;

const URL = /^https?:\/\/\S+$/;
const LINK = /^\[([^\]\n]*)\]\(([^)\s]*)\)$/;
const HEADING = /^#{1,6} /,
  QUOTE = /^> ?/,
  BULLET = /^[-*+] /,
  NUMBER = /^\d+[.)] /,
  FENCE = /^(```|~~~)/;

/** The edit that applies `style` to the selection `start`–`end` of `value`, or takes it off. */
export function formatMarkdown(
  value: string,
  start: number,
  end: number,
  style: MarkdownStyle,
): MarkdownEdit {
  if (
    style === 'heading' ||
    style === 'quote' ||
    style === 'bulleted' ||
    style === 'numbered' ||
    (style === 'code' && value.slice(start, end).includes('\n'))
  )
    return lineFormat(value, start, end, style);
  const selected = value.slice(start, end);
  // Spaces at the edges of a selection stay outside the marks: `** bold **` is not bold.
  const lead = /^\s*/.exec(selected)![0],
    core = selected.trim(),
    from = start + lead.length,
    to = from + core.length;
  if (style === 'link') {
    const whole = LINK.exec(core);
    if (whole)
      return {
        from,
        to,
        text: whole[1],
        select: [from, from + whole[1].length],
      };
    // The text of a link selected: the link is taken off it.
    const tail = /^\]\([^)\s]*\)/.exec(value.slice(to));
    if (value[from - 1] === '[' && tail)
      return {
        from: from - 1,
        to: to + tail[0].length,
        text: core,
        select: [from - 1, to - 1],
      };
    if (URL.test(core))
      return {
        from,
        to,
        text: `[](${core})`,
        select: [from + 1, from + 1],
      };
    // The address to type or paste is selected; without a selection the cursor goes where the link text is written.
    return core
      ? {
          from,
          to,
          text: `[${core}](url)`,
          select: [from + core.length + 3, from + core.length + 6],
        }
      : { from, to, text: '[](url)', select: [from + 1, from + 1] };
  }
  const char = style === 'code' ? '`' : '*',
    width = style === 'bold' ? 2 : 1,
    mark = char.repeat(width);
  // Marks around the selection, as after selecting the words of `**bold**`.
  const around = Math.min(
    count(value, from, -1, char),
    count(value, to, 1, char),
  );
  if (marks(style, around))
    return {
      from: from - width,
      to: to + width,
      text: core,
      select: [from - width, to - width],
    };
  // Marks inside it, as after selecting all of `**bold**`.
  const inside = Math.min(
    count(core, 0, 1, char),
    count(core, core.length, -1, char),
  );
  if (core.length > 2 * inside && marks(style, inside))
    return {
      from,
      to,
      text: core.slice(width, core.length - width),
      select: [from, to - 2 * width],
    };
  return {
    from,
    to,
    text: `${mark}${core}${mark}`,
    select: [from + width, to + width],
  };
}

/** The lines the selection touches; a selection that ends at the start of a line does not take that line. */
function lineSpan(value: string, start: number, end: number) {
  const from = value.lastIndexOf('\n', start - 1) + 1;
  const stop = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const next = value.indexOf('\n', stop);
  return { from, to: next < 0 ? value.length : next };
}

function lineFormat(
  value: string,
  start: number,
  end: number,
  style: 'code' | 'heading' | 'quote' | 'bulleted' | 'numbered',
): MarkdownEdit {
  const { from, to } = lineSpan(value, start, end);
  const rows = value.slice(from, to).split('\n');
  if (style === 'code') {
    // Several lines become a fenced block, or stop being one.
    const fenced =
      rows.length > 2 &&
      FENCE.test(rows[0]) &&
      FENCE.test(rows[rows.length - 1]);
    const text = fenced
      ? rows.slice(1, -1).join('\n')
      : ['```', ...rows, '```'].join('\n');
    return { from, to, text, select: [from, from + text.length] };
  }
  const filled = rows.filter((r) => r.trim());
  const strip = (r: string) =>
    style === 'heading'
      ? r.replace(HEADING, '')
      : style === 'quote'
        ? r.replace(QUOTE, '')
        : r.replace(BULLET, '').replace(NUMBER, '');
  let prefix: (n: number) => string;
  if (style === 'heading') {
    const level = /^(#{1,6}) /.exec(rows[0])?.[1].length ?? 0;
    const next = level < 2 ? 2 : level === 2 ? 3 : 0;
    prefix = () => (next ? `${'#'.repeat(next)} ` : '');
  } else {
    const has =
      style === 'quote' ? QUOTE : style === 'bulleted' ? BULLET : NUMBER;
    const off = filled.length > 0 && filled.every((r) => has.test(r));
    prefix = (n) =>
      off
        ? ''
        : style === 'quote'
          ? '> '
          : style === 'bulleted'
            ? '- '
            : `${n + 1}. `;
  }
  // Blank lines between the selected ones stay blank; a blank line on its own gets the prefix to write after.
  let n = 0;
  const next = rows.map((r) =>
    r.trim() || rows.length === 1 ? prefix(n++) + strip(r) : r,
  );
  const text = next.join('\n');
  if (start !== end)
    return { from, to, text, select: [from, from + text.length] };
  // A cursor keeps its place in the line's text.
  const tail = Math.min(to - start, strip(rows[0]).length);
  const caret = from + text.length - tail;
  return { from, to, text, select: [caret, caret] };
}

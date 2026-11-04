// Bold, italic and link from the keyboard in a Markdown text box (2026-11-04 user request, as GitHub's comment box):
// the selection is wrapped, or the marks are written with the cursor between them, and the same key takes them off
// again. Italic is `*`, not `_`, since `_` does not mark words inside Chinese or Japanese text.

export type MarkdownStyle = 'bold' | 'italic' | 'link';
/** Replace `from`–`to` with `text`, then select `select` in the new value. */
export type MarkdownEdit = {
  from: number;
  to: number;
  text: string;
  select: [number, number];
};

/** How many `*` stand together going back from (`step` -1) or on from (`step` 1) `at`. */
function stars(value: string, at: number, step: -1 | 1) {
  let n = 0;
  while (value[step < 0 ? at - 1 - n : at + n] === '*') n++;
  return n;
}
/** Whether `n` stars on each side make the style: `**` bold, `*` italic, `***` both. */
const marks = (style: 'bold' | 'italic', n: number) =>
  style === 'bold' ? n >= 2 : n === 1 || n >= 3;

const URL = /^https?:\/\/\S+$/;
const LINK = /^\[([^\]\n]*)\]\(([^)\s]*)\)$/;

/** The edit that applies `style` to the selection `start`–`end` of `value`, or takes it off. */
export function formatMarkdown(
  value: string,
  start: number,
  end: number,
  style: MarkdownStyle,
): MarkdownEdit {
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
  const width = style === 'bold' ? 2 : 1,
    mark = '*'.repeat(width);
  // Marks around the selection, as after selecting the words of `**bold**`.
  const around = Math.min(stars(value, from, -1), stars(value, to, 1));
  if (marks(style, around))
    return {
      from: from - width,
      to: to + width,
      text: core,
      select: [from - width, to - width],
    };
  // Marks inside it, as after selecting all of `**bold**`.
  const inside = Math.min(stars(core, 0, 1), stars(core, core.length, -1));
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

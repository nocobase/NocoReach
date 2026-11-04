import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ClipboardEvent } from 'react';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import { MarkdownEditor } from '../../client/pages/task-detail/markdown-editor';
import {
  formatMarkdown,
  type MarkdownStyle,
} from '../../client/pages/task-detail/markdown-format';

// 2026-11-04 user request (T-62): bold, italic and a link from the keyboard while editing an article by hand, as
// GitHub's comment box does.

beforeEach(() => {
  cleanup();
  setDictionary(english);
});
afterEach(() => {
  setDictionary(null);
  vi.restoreAllMocks();
});

/** The text after applying `style` to the part between « and » of `marked`, with the new selection marked the same way. */
function format(marked: string, style: MarkdownStyle) {
  const start = marked.indexOf('«'),
    end = marked.indexOf('»') - 1;
  const value = marked.replace('«', '').replace('»', '');
  const edit = formatMarkdown(value, start, end, style);
  const next = value.slice(0, edit.from) + edit.text + value.slice(edit.to);
  const [a, b] = edit.select;
  return `${next.slice(0, a)}«${next.slice(a, b)}»${next.slice(b)}`;
}

it.each([
  // Wrapped, and taken off again by the same key, whether the marks are selected or not.
  ['Make «this» stand out', 'bold', 'Make **«this»** stand out'],
  ['Make **«this»** stand out', 'bold', 'Make «this» stand out'],
  ['Make «**this**» stand out', 'bold', 'Make «this» stand out'],
  ['Make «this» lean', 'italic', 'Make *«this»* lean'],
  ['Make *«this»* lean', 'italic', 'Make «this» lean'],
  // Italic inside bold, and either taken off bold-italic, leaves the other.
  ['Make **«this»** lean', 'italic', 'Make ***«this»*** lean'],
  ['Make ***«this»*** lean', 'italic', 'Make **«this»** lean'],
  ['Make ***«this»*** lean', 'bold', 'Make *«this»* lean'],
  // Nothing selected: the marks, with the cursor between them; pressed again, they go.
  ['Bold «»here', 'bold', 'Bold **«»**here'],
  ['Bold **«»**here', 'bold', 'Bold «»here'],
  // Spaces at the edges stay outside, so the marks still make it bold; Chinese works with `*`.
  ['Make« this »stand out', 'bold', 'Make **«this»** stand out'],
  ['这是«重点»内容', 'italic', '这是*«重点»*内容'],
  // A link: the address to type is selected; a selected address becomes the link with its text to write.
  ['See «the docs» here', 'link', 'See [the docs](«url») here'],
  ['See «»', 'link', 'See [«»](url)'],
  [
    'See «https://docs.nocobase.com»',
    'link',
    'See [«»](https://docs.nocobase.com)',
  ],
  // And taken off a link, from its text or from the whole link.
  ['See [«the docs»](https://docs.nocobase.com)', 'link', 'See «the docs»'],
  ['See «[the docs](https://docs.nocobase.com)»', 'link', 'See «the docs»'],
  // Code: inline in a line, a fenced block over several lines; taken off the same way.
  ['Run «npm i» now', 'code', 'Run `«npm i»` now'],
  ['Run `«npm i»` now', 'code', 'Run «npm i» now'],
  ['«a\nb»', 'code', '«```\na\nb\n```»'],
  ['«```\na\n```»', 'code', '«a»'],
  // Lines: the prefix goes on every selected line, or off when they all have it; a cursor keeps its place.
  ['One\n«Two»', 'bulleted', 'One\n«- Two»'],
  ['«a\nb»', 'bulleted', '«- a\n- b»'],
  ['«- a\n- b»', 'bulleted', '«a\nb»'],
  ['«- a\n- b»', 'numbered', '«1. a\n2. b»'],
  ['«a\n\nb»', 'numbered', '«1. a\n\n2. b»'],
  ['Ite«»m', 'bulleted', '- Ite«»m'],
  ['«»', 'quote', '> «»'],
  ['Say «so»', 'quote', '«> Say so»'],
  ['> Say «so»', 'quote', '«Say so»'],
  // The heading goes ## → ### → none.
  ['Title«»', 'heading', '## Title«»'],
  ['## Title«»', 'heading', '### Title«»'],
  ['### Title«»', 'heading', 'Title«»'],
] as const)('%s (%s) becomes %s', (marked, style, expected) => {
  expect(format(marked, style)).toBe(expected);
});

function Editor({
  onPaste,
  onImages,
}: {
  onPaste?: (e: ClipboardEvent) => void;
  onImages?: (box: HTMLTextAreaElement, files: File[]) => void;
}) {
  const [value, setValue] = useState('Self-hosted NocoBase');
  return (
    <MarkdownEditor
      id='body'
      aria-label='Body'
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onPaste={onPaste}
      onImages={onImages}
      preview={(text) => <p>{text}</p>}
    />
  );
}
const box = () =>
  screen.getByRole('textbox', { name: 'Body' }) as HTMLTextAreaElement;

it('makes the selection bold, italic or a link with Ctrl+B, Ctrl+I and Ctrl+K, and takes bold off again', async () => {
  const user = userEvent.setup();
  render(<Editor />);
  box().focus();
  box().setSelectionRange(12, 20);
  await user.keyboard('{Control>}b{/Control}');
  expect(box()).toHaveValue('Self-hosted **NocoBase**');
  // The words stay selected, so the same key takes the marks off.
  expect([box().selectionStart, box().selectionEnd]).toEqual([14, 22]);
  await user.keyboard('{Control>}b{/Control}');
  expect(box()).toHaveValue('Self-hosted NocoBase');
  await user.keyboard('{Control>}i{/Control}');
  expect(box()).toHaveValue('Self-hosted *NocoBase*');
  box().setSelectionRange(0, 11);
  await user.keyboard('{Control>}k{/Control}');
  expect(box()).toHaveValue('[Self-hosted](url) *NocoBase*');
  // The address is selected, ready to paste over.
  expect(box().value.slice(box().selectionStart, box().selectionEnd)).toBe(
    'url',
  );
  await user.keyboard('https://www.nocobase.com');
  expect(box()).toHaveValue(
    '[Self-hosted](https://www.nocobase.com) *NocoBase*',
  );
});

it('writes through insertText where the browser has it, so Undo takes the change back', async () => {
  const user = userEvent.setup();
  render(<Editor />);
  // The browser's command: replaces the selection as typing would, which joins the undo history.
  const execCommand = vi.fn((command: string, _ui: boolean, text: string) => {
    expect(command).toBe('insertText');
    const b = box();
    b.setRangeText(text, b.selectionStart, b.selectionEnd, 'end');
    b.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  });
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: execCommand,
  });
  try {
    box().focus();
    box().setSelectionRange(12, 20);
    await user.keyboard('{Control>}b{/Control}');
    expect(execCommand).toHaveBeenCalledWith(
      'insertText',
      false,
      '**NocoBase**',
    );
    expect(box()).toHaveValue('Self-hosted **NocoBase**');
    expect([box().selectionStart, box().selectionEnd]).toEqual([14, 22]);
  } finally {
    delete (document as { execCommand?: unknown }).execCommand;
  }
});

it('uses ⌘ on a Mac, where Ctrl+B and Ctrl+K keep moving the cursor and deleting a line', async () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15',
  );
  const user = userEvent.setup();
  render(<Editor />);
  box().focus();
  box().setSelectionRange(12, 20);
  await user.keyboard('{Control>}b{/Control}');
  expect(box()).toHaveValue('Self-hosted NocoBase');
  await user.keyboard('{Meta>}b{/Meta}');
  expect(box()).toHaveValue('Self-hosted **NocoBase**');
});

it('leaves other shortcuts, a read-only box and the paste handler alone', async () => {
  const onPaste = vi.fn();
  const user = userEvent.setup();
  render(<Editor onPaste={onPaste} />);
  box().focus();
  box().setSelectionRange(0, 4);
  await user.keyboard('{Control>}{Shift>}b{/Shift}{/Control}');
  await user.keyboard('{Control>}a{/Control}');
  expect(box()).toHaveValue('Self-hosted NocoBase');
  fireEvent.paste(box(), { clipboardData: { files: [], getData: () => '' } });
  expect(onPaste).toHaveBeenCalledTimes(1);
  box().readOnly = true;
  box().setSelectionRange(0, 4);
  await user.keyboard('{Control>}b{/Control}');
  expect(box()).toHaveValue('Self-hosted NocoBase');
});

it('formats from the toolbar, keeping the selection in the text, and names each button with its shortcut', async () => {
  const user = userEvent.setup();
  render(<Editor />);
  const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
  expect(toolbar).toHaveAttribute('aria-controls', 'body');
  expect(
    Array.from(toolbar.querySelectorAll('button'), (b) =>
      b.getAttribute('aria-label'),
    ),
  ).toEqual([
    'Bold',
    'Italic',
    'Link',
    'Numbered list',
    'Bulleted list',
    'Heading',
    'Quote',
    'Code',
  ]);
  box().focus();
  box().setSelectionRange(12, 20);
  await user.click(screen.getByRole('button', { name: 'Bold' }));
  expect(box()).toHaveValue('Self-hosted **NocoBase**');
  expect(box()).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Heading' }));
  expect(box()).toHaveValue('## Self-hosted **NocoBase**');
  await user.hover(screen.getByRole('button', { name: 'Italic' }));
  expect(await screen.findByText('Italic')).toBeVisible();
  expect(screen.getByText('Ctrl I')).toBeVisible();
});

it('offers images from the toolbar only where the box takes them', async () => {
  const user = userEvent.setup();
  const { unmount } = render(<Editor />);
  expect(screen.queryByRole('button', { name: 'Add image' })).toBeNull();
  unmount();
  const onImages = vi.fn();
  const { container } = render(<Editor onImages={onImages} />);
  const add = screen.getByRole('button', { name: 'Add image' });
  expect(screen.getByRole('toolbar', { name: 'Formatting' })).toContainElement(
    add,
  );
  // Just its name, as the other buttons: the limits show only when a file breaks them.
  await user.hover(add);
  expect(await screen.findByText('Add image')).toBeVisible();
  expect(screen.queryByText(/PNG|Paste or drop/)).toBeNull();
  const picker = container.querySelector<HTMLInputElement>('input[type=file]')!;
  const image = new File(['png'], 'workspace.png', { type: 'image/png' });
  fireEvent.change(picker, { target: { files: [image] } });
  expect(onImages).toHaveBeenCalledWith(box(), [image]);
  expect(box()).toHaveFocus();
});

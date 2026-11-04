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
] as const)('%s (%s) becomes %s', (marked, style, expected) => {
  expect(format(marked, style)).toBe(expected);
});

function Editor({ onPaste }: { onPaste?: (e: ClipboardEvent) => void }) {
  const [value, setValue] = useState('Self-hosted NocoBase');
  return (
    <MarkdownEditor
      aria-label='Body'
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onPaste={onPaste}
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

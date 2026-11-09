import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import { ArticleBodyEditor } from '../../client/pages/task-detail/article-body-editor';
import type { RewriteHost } from '../../client/pages/task-detail/inline-rewrite-marks';
import english from '../../shared/i18n/en.json';

// The article editor's link box (⌘K) can always be closed and covers no text (2026-11-09, as the Rewrite with AI bar):
// a Cancel button, Esc from anywhere on the page, a press outside it, and room of its own under the paragraph.

const BODY =
  'NocoBase 3 is the new generation.\n\nNocoBase 3 lets AI build, configure and maintain apps.';

beforeEach(() => {
  setDictionary(english);
  // The editor measures the selection to place its boxes, which jsdom does not lay out.
  const rect = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  Object.assign(Range.prototype, {
    getClientRects: () => [],
    getBoundingClientRect: () => rect,
  });
});
afterEach(() => {
  cleanup();
  setDictionary(null);
  const range = Range.prototype as Partial<Range>;
  delete range.getClientRects;
  delete range.getBoundingClientRect;
});

const editorOf = () =>
  (
    screen.getByRole('textbox', { name: 'Body' }) as HTMLElement & {
      editor: Editor;
    }
  ).editor;
const selectionOf = () => {
  const { from, to } = editorOf().state.selection;
  return { from, to };
};
/** Selects `text` in the body, as dragging over it would. */
function select(text: string) {
  const editor = editorOf();
  let from = -1;
  editor.state.doc.descendants((node, pos) => {
    const at = node.isText ? node.text!.indexOf(text) : -1;
    if (from < 0 && at >= 0) from = pos + at;
    return from < 0;
  });
  act(() => {
    editor
      .chain()
      .focus()
      .setTextSelection({ from, to: from + text.length })
      .run();
  });
  return selectionOf();
}
/** Selects `text` in the body and opens the link box with ⌘K. */
function openLink(text: string) {
  const picked = select(text);
  act(() => {
    editorOf().commands.keyboardShortcut('Mod-k');
  });
  return picked;
}
const box = () => screen.queryByRole('group', { name: 'Link' });
const rewrite: RewriteHost = {
  async *stream() {
    yield 'lets AI run apps';
  },
  onAccepted: vi.fn(),
};
function renderEditor(onChange = vi.fn()) {
  render(
    <>
      <ArticleBodyEditor
        aria-label='Body'
        value={BODY}
        onChange={onChange}
        rewrite={rewrite}
      />
      <button type='button'>Elsewhere</button>
    </>,
  );
  return onChange;
}

test('Cancel closes the link box, keeping the selection and the text as they were', async () => {
  const user = userEvent.setup();
  const onChange = renderEditor();
  const picked = openLink('lets AI build');
  await user.type(
    screen.getByRole('textbox', { name: 'Link address' }),
    'https://example.com',
  );
  await user.click(screen.getByRole('button', { name: /Cancel/ }));
  expect(box()).toBeNull();
  expect(selectionOf()).toEqual(picked);
  expect(editorOf().isActive('link')).toBe(false);
  expect(onChange).not.toHaveBeenCalled();
});

test('Esc closes the link box from anywhere on the page, but not while choosing an IME candidate', async () => {
  const user = userEvent.setup();
  renderEditor();
  const picked = openLink('lets AI build');
  const address = screen.getByRole('textbox', { name: 'Link address' });
  expect(address).toHaveFocus();
  fireEvent.keyDown(address, { key: 'Escape', isComposing: true });
  expect(box()).toBeVisible();
  act(() => {
    screen.getByRole('button', { name: 'Elsewhere' }).focus();
  });
  await user.keyboard('{Escape}');
  expect(box()).toBeNull();
  expect(selectionOf()).toEqual(picked);
});

test('a press outside closes the link box with the selection kept; one inside does not', async () => {
  const user = userEvent.setup();
  const onChange = renderEditor();
  const picked = openLink('lets AI build');
  await user.click(screen.getByRole('textbox', { name: 'Link address' }));
  expect(box()).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
  expect(box()).toBeNull();
  expect(selectionOf()).toEqual(picked);
  expect(onChange).not.toHaveBeenCalled();

  // Apply still links the words.
  openLink('lets AI build');
  await user.type(
    screen.getByRole('textbox', { name: 'Link address' }),
    'https://example.com{Enter}',
  );
  expect(box()).toBeNull();
  expect(onChange).toHaveBeenLastCalledWith(
    'NocoBase 3 is the new generation.\n\nNocoBase 3 [lets AI build](https://example.com), configure and maintain apps.',
  );
});

test('the link box has room of its own under the paragraph, so the text after it moves down', () => {
  renderEditor();
  const body = screen.getByRole('textbox', { name: 'Body' });
  expect(body.querySelector('[data-room="link"]')).toBeNull();
  openLink('is the new');
  const [first, second] = body.querySelectorAll('p');
  const room = body.querySelector('[data-room="link"]');
  expect(room?.previousElementSibling).toBe(first);
  expect(room?.nextElementSibling).toBe(second);
  act(() => {
    screen.getByRole('button', { name: /Cancel/ }).click();
  });
  expect(body.querySelector('[data-room="link"]')).toBeNull();
});

test('while the link box is open the linked words stay marked, and Rewrite with AI is out of the way', async () => {
  const user = userEvent.setup();
  renderEditor();
  const body = screen.getByRole('textbox', { name: 'Body' });
  select('lets AI build');
  expect(
    await screen.findByRole('button', { name: /Rewrite with AI/ }),
  ).toBeVisible();
  openLink('lets AI build');
  expect(body.querySelector('.nr-link-picked')).toHaveTextContent(
    'lets AI build',
  );
  expect(screen.queryByRole('button', { name: /Rewrite with AI/ })).toBeNull();
  act(() => {
    editorOf().commands.keyboardShortcut('Mod-j');
  });
  expect(screen.queryByRole('group', { name: 'Rewrite with AI' })).toBeNull();
  expect(box()).toBeVisible();

  // Back once the box closes, the selection still there.
  await user.click(screen.getByRole('button', { name: /Cancel/ }));
  expect(body.querySelector('.nr-link-picked')).toBeNull();
  expect(
    await screen.findByRole('button', { name: /Rewrite with AI/ }),
  ).toBeVisible();
});

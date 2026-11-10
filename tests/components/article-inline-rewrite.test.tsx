import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import { ArticleBodyEditor } from '../../client/pages/task-detail/article-body-editor';
import type { RewriteHost } from '../../client/pages/task-detail/inline-rewrite-marks';
import english from '../../shared/i18n/en.json';

// Select part of the article body and say how to change it (2026-11-04 user request): AI rewrites only the selection,
// shown under the struck-through original until it is accepted; every attempt stays to go back to, and ⌘Z undoes an
// accepted one.

const BODY =
  'NocoBase 3 is the new generation.\n\nNocoBase 3 lets AI build, configure and maintain apps.';

beforeEach(() => {
  setDictionary(english);
  // The editor measures the selection to place its button and bar, which jsdom does not lay out.
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
}
/** A model that answers each request with the next of `answers`, in two pieces. */
function host(answers: string[]) {
  const requests: Parameters<RewriteHost['stream']>[0][] = [];
  const value: RewriteHost = {
    async *stream(request) {
      requests.push(request);
      const answer = answers[requests.length - 1];
      yield answer.slice(0, 3);
      await Promise.resolve();
      yield answer.slice(3);
    },
    onAccepted: vi.fn(),
  };
  return { value, requests };
}

test('rewrites the selected words in place, keeps each attempt, and ⌘Z undoes the one accepted', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const model = host(['lets AI build and run apps', 'runs apps with AI']);
  render(
    <ArticleBodyEditor
      aria-label='Body'
      value={BODY}
      onChange={onChange}
      rewrite={model.value}
    />,
  );
  select('lets AI build, configure and maintain apps');
  await user.click(
    await screen.findByRole('button', { name: /Rewrite with AI/ }),
  );
  // Nothing changes in the article while the person asks and looks.
  expect(editorOf().isEditable).toBe(false);
  await user.type(
    screen.getByRole('textbox', { name: /Say how to change it/ }),
    'shorter{Enter}',
  );
  await screen.findByRole('button', { name: /Accept/ });
  expect(model.requests[0]).toEqual({
    selection: 'lets AI build, configure and maintain apps',
    instruction: 'shorter',
    history: [],
  });
  const body = screen.getByRole('textbox', { name: 'Body' });
  expect(body.querySelector('.nr-rewrite-old')).toHaveTextContent(
    'lets AI build, configure and maintain apps',
  );
  expect(body.querySelector('[data-rewrite-new]')).toHaveTextContent(
    'lets AI build and run apps',
  );
  expect(onChange).not.toHaveBeenCalled();

  // Asked again, from the attempt shown.
  await user.type(
    screen.getByRole('textbox', { name: /Change it again/ }),
    'even shorter{Enter}',
  );
  await screen.findByText('2 / 2');
  expect(model.requests[1]).toEqual({
    selection: 'lets AI build, configure and maintain apps',
    instruction: 'even shorter',
    history: [{ instruction: 'shorter', result: 'lets AI build and run apps' }],
  });
  expect(body.querySelector('[data-rewrite-new]')).toHaveTextContent(
    'runs apps with AI',
  );
  await user.click(screen.getByRole('button', { name: 'Previous result' }));
  expect(screen.getByText('1 / 2')).toBeVisible();
  expect(body.querySelector('[data-rewrite-new]')).toHaveTextContent(
    'lets AI build and run apps',
  );

  // Enter in the empty box accepts the attempt shown.
  await user.keyboard('{Enter}');
  await waitFor(() =>
    expect(onChange).toHaveBeenLastCalledWith(
      'NocoBase 3 is the new generation.\n\nNocoBase 3 lets AI build and run apps.',
    ),
  );
  expect(model.value.onAccepted).toHaveBeenCalledTimes(1);
  expect(editorOf().isEditable).toBe(true);
  expect(screen.queryByRole('group', { name: 'Rewrite with AI' })).toBeNull();
  act(() => {
    editorOf().commands.undo();
  });
  expect(onChange).toHaveBeenLastCalledWith(BODY);
});

test('a whole paragraph is rewritten as a paragraph, and Esc leaves the article as it was', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const model = host(['NocoBase 3 builds apps with AI.']);
  render(
    <ArticleBodyEditor
      aria-label='Body'
      value={BODY}
      onChange={onChange}
      rewrite={model.value}
    />,
  );
  select('NocoBase 3 lets AI build, configure and maintain apps.');
  act(() => {
    editorOf().commands.keyboardShortcut('Mod-j');
  });
  await user.type(
    await screen.findByRole('textbox', { name: /Say how to change it/ }),
    'simpler{Enter}',
  );
  await screen.findByRole('button', { name: /Accept/ });
  const body = screen.getByRole('textbox', { name: 'Body' });
  expect(body.querySelector('.nr-rewrite-old-block')).toHaveTextContent(
    'NocoBase 3 lets AI build, configure and maintain apps.',
  );
  expect(body.querySelector('.nr-rewrite-new-block')).toHaveTextContent(
    'NocoBase 3 builds apps with AI.',
  );
  await user.keyboard('{Escape}');
  expect(body.querySelector('[data-rewrite-new]')).toBeNull();
  expect(editorOf().isEditable).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
  expect(model.value.onAccepted).not.toHaveBeenCalled();
});

test('a rewrite that fails says why and keeps what was asked, to send again', async () => {
  const user = userEvent.setup();
  const rewrite: RewriteHost = {
    // eslint-disable-next-line require-yield -- refuses before writing anything
    async *stream() {
      throw new Error('Set a default chat model in Model services first.');
    },
    onAccepted: vi.fn(),
  };
  render(
    <ArticleBodyEditor
      aria-label='Body'
      value={BODY}
      onChange={vi.fn()}
      rewrite={rewrite}
    />,
  );
  select('lets AI build');
  await user.click(
    await screen.findByRole('button', { name: /Rewrite with AI/ }),
  );
  await user.type(
    screen.getByRole('textbox', { name: /Say how to change it/ }),
    'shorter{Enter}',
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Set a default chat model in Model services first.',
  );
  expect(
    screen.getByRole('textbox', { name: /Say how to change it/ }),
  ).toHaveValue('shorter');
});

const selectionOf = () => {
  const { from, to } = editorOf().state.selection;
  return { from, to };
};

test('Cancel closes the box before anything is asked, keeping the selection', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <ArticleBodyEditor
      aria-label='Body'
      value={BODY}
      onChange={onChange}
      rewrite={host([]).value}
    />,
  );
  select('lets AI build');
  const picked = selectionOf();
  await user.click(
    await screen.findByRole('button', { name: /Rewrite with AI/ }),
  );
  await user.click(screen.getByRole('button', { name: /Cancel/ }));
  expect(screen.queryByRole('group', { name: 'Rewrite with AI' })).toBeNull();
  expect(editorOf().isEditable).toBe(true);
  expect(selectionOf()).toEqual(picked);
  expect(onChange).not.toHaveBeenCalled();
});

test('Esc closes the box from anywhere on the page, but not while choosing an IME candidate', async () => {
  const user = userEvent.setup();
  render(
    <>
      <ArticleBodyEditor
        aria-label='Body'
        value={BODY}
        onChange={vi.fn()}
        rewrite={host([]).value}
      />
      <button type='button'>Elsewhere</button>
    </>,
  );
  select('lets AI build');
  await user.click(
    await screen.findByRole('button', { name: /Rewrite with AI/ }),
  );
  const ask = screen.getByRole('textbox', { name: /Say how to change it/ });
  fireEvent.keyDown(ask, { key: 'Escape', isComposing: true });
  expect(screen.getByRole('group', { name: 'Rewrite with AI' })).toBeVisible();
  const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
  act(() => {
    elsewhere.focus();
  });
  expect(ask).not.toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('group', { name: 'Rewrite with AI' })).toBeNull();
  expect(editorOf().isEditable).toBe(true);
});

test('a press outside closes the box before anything is asked, but not once there is a rewrite', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <>
      <ArticleBodyEditor
        aria-label='Body'
        value={BODY}
        onChange={onChange}
        rewrite={host(['lets AI run apps']).value}
      />
      <button type='button'>Elsewhere</button>
    </>,
  );
  select('lets AI build');
  const picked = selectionOf();
  await user.click(
    await screen.findByRole('button', { name: /Rewrite with AI/ }),
  );
  // Inside the bar it stays open.
  await user.click(
    screen.getByRole('textbox', { name: /Say how to change it/ }),
  );
  expect(screen.getByRole('group', { name: 'Rewrite with AI' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
  expect(screen.queryByRole('group', { name: 'Rewrite with AI' })).toBeNull();
  expect(editorOf().isEditable).toBe(true);
  expect(selectionOf()).toEqual(picked);

  select('lets AI build');
  await user.click(
    await screen.findByRole('button', { name: /Rewrite with AI/ }),
  );
  await user.type(
    screen.getByRole('textbox', { name: /Say how to change it/ }),
    'shorter{Enter}',
  );
  await screen.findByRole('button', { name: /Accept/ });
  await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
  expect(screen.getByRole('button', { name: /Accept/ })).toBeVisible();
  const body = screen.getByRole('textbox', { name: 'Body' });
  expect(body.querySelector('[data-rewrite-new]')).toHaveTextContent(
    'lets AI run apps',
  );
  expect(editorOf().isEditable).toBe(false);
  expect(onChange).not.toHaveBeenCalled();
});

test('Esc stops a rewrite being written and keeps what came so far', async () => {
  const user = userEvent.setup();
  const rewrite: RewriteHost = {
    async *stream(_request, signal) {
      yield 'lets AI';
      await new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () =>
          reject(new DOMException('Stopped', 'AbortError')),
        ),
      );
    },
    onAccepted: vi.fn(),
  };
  render(
    <ArticleBodyEditor
      aria-label='Body'
      value={BODY}
      onChange={vi.fn()}
      rewrite={rewrite}
    />,
  );
  select('lets AI build');
  await user.click(
    await screen.findByRole('button', { name: /Rewrite with AI/ }),
  );
  await user.type(
    screen.getByRole('textbox', { name: /Say how to change it/ }),
    'shorter{Enter}',
  );
  await screen.findByRole('status');
  const body = screen.getByRole('textbox', { name: 'Body' });
  await waitFor(() =>
    expect(body.querySelector('[data-rewrite-new]')).toHaveTextContent(
      'lets AI',
    ),
  );
  await user.keyboard('{Escape}');
  // Stopped, not closed: what came is there to accept, discard or ask again.
  expect(await screen.findByRole('button', { name: /Accept/ })).toBeVisible();
  expect(screen.queryByRole('status')).toBeNull();
  expect(body.querySelector('[data-rewrite-new]')).toHaveTextContent('lets AI');
});

test('the bar has room of its own under the paragraph, so the text after it moves down', async () => {
  const user = userEvent.setup();
  render(
    <ArticleBodyEditor
      aria-label='Body'
      value={BODY}
      onChange={vi.fn()}
      rewrite={host(['NocoBase 3 is new.']).value}
    />,
  );
  select('is the new');
  await user.click(
    await screen.findByRole('button', { name: /Rewrite with AI/ }),
  );
  const body = screen.getByRole('textbox', { name: 'Body' });
  const [first, second] = body.querySelectorAll('p');
  const room = body.querySelector('[data-room="rewrite"]');
  expect(room?.previousElementSibling).toBe(first);
  expect(room?.nextElementSibling).toBe(second);

  // A whole paragraph's rewrite: after the new block.
  await user.click(screen.getByRole('button', { name: /Cancel/ }));
  expect(body.querySelector('[data-room="rewrite"]')).toBeNull();
  select('NocoBase 3 is the new generation.');
  act(() => {
    editorOf().commands.keyboardShortcut('Mod-j');
  });
  await user.type(
    await screen.findByRole('textbox', { name: /Say how to change it/ }),
    'shorter{Enter}',
  );
  await screen.findByRole('button', { name: /Accept/ });
  expect(
    body.querySelector('[data-room="rewrite"]')?.previousElementSibling,
  ).toBe(body.querySelector('.nr-rewrite-new-block'));
});

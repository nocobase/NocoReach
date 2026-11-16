import { act, cleanup, render, screen } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import { ArticleBodyEditor } from '../../client/pages/task-detail/article-body-editor';
import { headerRowFirst } from '../../client/pages/task-detail/article-table';
import { TaskImageContext } from '../../client/pages/task-detail/task-images-model';
import english from '../../shared/i18n/en.json';

// 2026-11-12 user report on the article body editor: ⌘Z could not take a mistake back, and pasted images broke after a
// refresh. Undo goes back one change at a time, never past the body the editor was given (the saved edits arriving,
// another version), and an image is in the article's Markdown only at its task image address.

const AGENT = 'The first paragraph.\n\nThe second paragraph.';
const SAVED = 'The first paragraph, edited earlier.\n\nThe second paragraph.';
const ID = '0f6b3c2a-8d4e-4f1a-9b7c-2e5d6a7f8b90';
const REF = `/uploads/task-media/${ID}.png`;

let bodies: string[] = [];
let setOutside: (body: string) => void = () => {};
/** The card's part: the body handed back is kept (as the autosave does) and given back to the editor. */
function Card({ start }: { start: string }) {
  const [value, setValue] = useState(start);
  useEffect(() => {
    setOutside = setValue;
  }, []);
  return (
    <TaskImageContext.Provider value={{ projectId: 1, taskId: '7' }}>
      <ArticleBodyEditor
        aria-label='Body'
        value={value}
        takesImages
        pageUrl='https://acme.example/blog/setup'
        onChange={(body) => {
          bodies.push(body);
          setValue(body);
        }}
      />
    </TaskImageContext.Provider>
  );
}

const editorOf = () =>
  (
    screen.getByRole('textbox', { name: 'Body' }) as HTMLElement & {
      editor: Editor;
    }
  ).editor;
const markdown = () => editorOf().getMarkdown();
const last = () => bodies.at(-1);
/** A change made apart from the one before it, as after a pause in typing. */
function change(run: (e: Editor) => void) {
  act(() => {
    const e = editorOf();
    e.view.dispatch(closeHistory(e.state.tr));
    run(e);
  });
}
// Pressed as keys (Ctrl in jsdom, which is not an Apple device), so the editor's own keymap runs them.
const KEYS = {
  'Mod-z': { key: 'z', code: 'KeyZ', keyCode: 90 },
  'Shift-Mod-z': { key: 'Z', code: 'KeyZ', keyCode: 90, shiftKey: true },
  'Mod-y': { key: 'y', code: 'KeyY', keyCode: 89 },
};
const key = (shortcut: keyof typeof KEYS) =>
  act(() => {
    editorOf().view.dom.dispatchEvent(
      new KeyboardEvent('keydown', {
        ...KEYS[shortcut],
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
/** The end of the first text containing `text`. */
function after(text: string) {
  let at = -1;
  editorOf().state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text!.includes(text))
      at = pos + node.text!.indexOf(text) + text.length;
    return at < 0;
  });
  return at;
}
const typeAt = (text: string, words: string) =>
  change((e) => {
    e.chain().insertContentAt(after(text), words).run();
  });

/** The media requests, each answered when the test says so. */
type Pending = { url: string; body: unknown; answer: (ok: boolean) => void };
let requests: Pending[] = [];
beforeEach(() => {
  setDictionary(english);
  bodies = [];
  requests = [];
  const rect = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  Object.assign(Range.prototype, {
    getClientRects: () => [],
    getBoundingClientRect: () => rect,
  });
  let local = 0;
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: () => `blob:http://localhost/${++local}`,
      revokeObjectURL: vi.fn(),
    }),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url: string, init: RequestInit) =>
        new Promise<Response>((resolve) => {
          requests.push({
            url: String(url),
            body: init.body,
            answer: (ok) =>
              resolve(
                ok
                  ? Response.json(
                      {
                        data: {
                          id: ID,
                          filename: 'image.png',
                          mimeType: 'image/png',
                          size: 68,
                          contentUrl: `/main${REF}`,
                        },
                      },
                      { status: 201 },
                    )
                  : Response.json({ error: {} }, { status: 503 }),
              ),
          });
        }),
    ),
  );
});
afterEach(() => {
  cleanup();
  setDictionary(null);
  vi.unstubAllGlobals();
  const range = Range.prototype as Partial<Range>;
  delete range.getClientRects;
  delete range.getBoundingClientRect;
});
/** The next media request answered: stored, or refused. */
const answer = async (ok = true) => {
  await vi.waitFor(() => expect(requests).not.toHaveLength(0));
  await act(async () => {
    requests.shift()!.answer(ok);
    await new Promise((r) => setTimeout(r, 0));
  });
};
/** HTML pasted into the editor (jsdom has no ClipboardEvent: a paste event without clipboard data). */
const paste = (html: string) =>
  act(() => {
    editorOf().view.pasteHTML(html, new Event('paste') as ClipboardEvent);
  });

test('the saved edits arriving after the editor opened are not a step to undo', () => {
  render(<Card start={AGENT} />);
  act(() => setOutside(SAVED));
  expect(markdown()).toBe(SAVED);
  expect(editorOf().can().undo()).toBe(false);
  typeAt('second paragraph.', ' More.');
  expect(last()).toBe(`${SAVED} More.`);
  key('Mod-z');
  expect(markdown()).toBe(SAVED);
  // Nothing before the saved edits to go back to: the Agent's version does not come back.
  key('Mod-z');
  expect(markdown()).toBe(SAVED);
  expect(last()).toBe(SAVED);
});

test('undo takes changes back one at a time, through the autosave handing the body back', () => {
  render(<Card start={AGENT} />);
  typeAt('first paragraph.', ' One.');
  typeAt('One.', ' Two.');
  // Each change was handed back and given to the editor again, as the autosave does.
  expect(bodies).toEqual([
    'The first paragraph. One.\n\nThe second paragraph.',
    'The first paragraph. One. Two.\n\nThe second paragraph.',
  ]);
  change((e) => {
    e.chain().setTextSelection({ from: 1, to: 4 }).toggleBold().run();
  });
  change((e) => {
    e.chain()
      .setTextSelection({
        from: after('second'),
        to: after('second paragraph'),
      })
      .setLink({ href: 'https://acme.example/' })
      .run();
  });
  expect(last()).toBe(
    '**The** first paragraph. One. Two.\n\nThe second [paragraph](https://acme.example/).',
  );
  key('Mod-z');
  expect(markdown()).toBe(
    '**The** first paragraph. One. Two.\n\nThe second paragraph.',
  );
  key('Mod-z');
  expect(markdown()).toBe(
    'The first paragraph. One. Two.\n\nThe second paragraph.',
  );
  key('Mod-z');
  expect(markdown()).toBe('The first paragraph. One.\n\nThe second paragraph.');
  key('Mod-z');
  expect(markdown()).toBe(AGENT);
  expect(last()).toBe(AGENT);
  key('Shift-Mod-z');
  expect(markdown()).toBe('The first paragraph. One.\n\nThe second paragraph.');
  key('Mod-y');
  expect(last()).toBe(
    'The first paragraph. One. Two.\n\nThe second paragraph.',
  );
});

test('a table change from the Table menu is one step to undo', () => {
  const table = '| Plan | Price |\n| --- | --- |\n| Free | $0 |';
  render(<Card start={`Intro.\n\n${table}`} />);
  change((e) => {
    e.chain()
      .setTextSelection(after('Free'))
      .addRowAfter()
      .command(headerRowFirst)
      .run();
  });
  expect(last()).toContain('| Free | $0    |\n|      |       |');
  key('Mod-z');
  expect(last()).toBe(`Intro.\n\n${table}`);
});

/** An image added with Add image, from the toolbar's file picker. */
function addImage() {
  const picker = document.querySelector<HTMLInputElement>('input[type=file]')!;
  const file = new File([new Uint8Array([137, 80, 78, 71])], 'board.png', {
    type: 'image/png',
  });
  change((e) => {
    e.commands.setTextSelection(after('second paragraph.'));
  });
  act(() => {
    Object.defineProperty(picker, 'files', {
      value: [file],
      configurable: true,
    });
    picker.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

test('an added image is one step to undo and redo, and never leaves its local address behind', async () => {
  render(<Card start={AGENT} />);
  addImage();
  // Shown from the file at once; the body is not handed back until it is uploaded.
  expect(markdown()).toContain('](blob:');
  expect(bodies).toEqual([]);
  expect(screen.getByRole('status')).toHaveTextContent('Uploading images…');
  await answer();
  expect(last()).toBe(`${AGENT}\n\n![board](${REF})`);
  key('Mod-z');
  expect(markdown()).toBe(AGENT);
  expect(last()).toBe(AGENT);
  key('Shift-Mod-z');
  expect(last()).toBe(`${AGENT}\n\n![board](${REF})`);
  expect(bodies.join('\n')).not.toContain('blob:');
});

test('an image taken back while it uploads comes back at its uploaded address', async () => {
  render(<Card start={AGENT} />);
  addImage();
  key('Mod-z');
  expect(markdown()).toBe(AGENT);
  await answer();
  key('Shift-Mod-z');
  expect(markdown()).not.toContain('blob:');
  expect(last()).toBe(`${AGENT}\n\n![board](${REF})`);
  expect(bodies.join('\n')).not.toContain('blob:');
});

test('an image pasted from another site is copied in, and is the article’s own task image', async () => {
  render(<Card start={AGENT} />);
  change((e) => {
    e.commands.setTextSelection(after('second paragraph.'));
  });
  paste(
    '<p>From a page</p><img src="https://cdn.example.org/team.png" alt="Team">',
  );
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0]?.url).toMatch(/\/api\/nocoreachTasks\/media\/import\?/);
  expect(JSON.parse(String(requests[0]?.body))).toEqual({
    url: 'https://cdn.example.org/team.png',
  });
  expect(bodies).toEqual([]);
  await answer();
  expect(last()).toContain(`![Team](${REF})`);
  expect(last()).not.toContain('cdn.example.org');
});

test('a pasted image that cannot be copied is taken out, with a message', async () => {
  render(<Card start={AGENT} />);
  change((e) => {
    e.commands.setTextSelection(after('second paragraph.'));
  });
  paste(
    '<p>From Feishu</p><img src="https://internal-api-drive-stream.feishu.cn/download/x" alt="Plan">',
  );
  await answer(false);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Could not copy the image from internal-api-drive-stream.feishu.cn. Save it, then add it with Add image.',
  );
  expect(last()).toContain('From Feishu');
  expect(last()).not.toContain('![');
});

test('images the editor copied itself, and the article site’s own, are kept as they are', () => {
  render(<Card start={AGENT} />);
  change((e) => {
    e.commands.setTextSelection(after('second paragraph.'));
  });
  paste(
    '<p>Copied</p><img src="https://acme.example/images/a.png" data-nr-src="/images/a.png" alt="A"><img src="https://acme.example/images/b.png" alt="B">',
  );
  expect(requests).toEqual([]);
  expect(last()).toContain('![A](/images/a.png)');
  expect(last()).toContain('![B](https://acme.example/images/b.png)');
});

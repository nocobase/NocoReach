import { afterEach, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import {
  mergeExtensions,
  richTextExtensions,
} from '../../client/components/rich-text-markdown';
import {
  readMarkdown,
  writeMarkdown,
} from '../../client/pages/task-detail/faithful-markdown';

// 2026-11-04 user request: the article body is edited as it reads, and what is saved is still the article's Markdown,
// with every block nobody touched exactly as it was.

const ARTICLE = [
  '---',
  "title: 'Quick start'",
  '---',
  '',
  'NocoBase 3 is the **next generation** of NocoBase, and *AI* takes part in building.',
  '',
  '## What changed',
  '',
  '1. Describe the need in one sentence.',
  '2. AI lists the tables and pages.',
  '   - Confirm, then it builds them.',
  '   - Adjust them later by hand.',
  '',
  '![NocoBase 3 workspace](https://www.nocobase.com/img/workspace-2025.png "Workspace")',
  '',
  '<img src="https://www.nocobase.com/img/flow.png" width="600" alt="Flow">',
  '',
  '| Plan | Price |',
  '| --- | ---: |',
  '| Community | Free |',
  '| Pro | $800 |',
  '',
  '> Migration keeps your data.',
  '',
  ':::tip',
  'Back up the database before migrating.',
  ':::',
  '',
  '```bash',
  'pnpm create @nocobase/app my-app',
  '```',
  '',
  'Read the [docs](https://docs.nocobase.com/) or visit https://www.nocobase.com/en/blog.  ',
  'A line after a hard break.',
  '',
].join('\n');

let editor: Editor | undefined;
afterEach(() => editor?.destroy());

function open(markdown: string) {
  editor = new Editor({
    extensions: mergeExtensions(richTextExtensions(), [Image]),
    content: markdown,
    contentType: 'markdown',
  });
  const source = readMarkdown(editor, markdown);
  return { editor, source, write: () => writeMarkdown(editor!, source) };
}

/** The position at the end of the first text containing `text`. */
function after(e: Editor, text: string) {
  let at = -1;
  e.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text!.includes(text))
      at = pos + node.text!.indexOf(text) + text.length;
    return at < 0;
  });
  return at;
}

it('writes back an untouched article exactly as it was read', () => {
  const { write } = open(ARTICLE);
  expect(write()).toBe(ARTICLE);
});

it('rewrites only the block that was edited', () => {
  const { editor: e, write } = open(ARTICLE);
  e.chain()
    .insertContentAt(after(e, 'takes part in building.'), ' It is open source.')
    .run();
  expect(write()).toBe(
    ARTICLE.replace(
      'takes part in building.',
      'takes part in building. It is open source.',
    ),
  );
});

it('keeps the table, HTML and front matter when a block is added or removed', () => {
  const { editor: e, write } = open(ARTICLE);
  // A new paragraph after the quote, and the code block removed.
  const at = (type: string) => {
    let found = -1;
    e.state.doc.forEach((node, offset) => {
      if (found < 0 && node.type.name === type) found = offset;
    });
    return found;
  };
  const quote = at('blockquote');
  e.chain()
    .insertContentAt(quote + e.state.doc.nodeAt(quote)!.nodeSize, {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Plans can change.' }],
    })
    .run();
  const code = at('codeBlock');
  e.chain()
    .deleteRange({ from: code, to: code + e.state.doc.nodeAt(code)!.nodeSize })
    .run();
  const out = write();
  expect(out).toContain(
    '> Migration keeps your data.\n\nPlans can change.\n\n:::tip',
  );
  expect(out).not.toContain('pnpm create');
  for (const kept of [
    "---\ntitle: 'Quick start'\n---",
    '| Plan | Price |\n| --- | ---: |\n| Community | Free |',
    '<img src="https://www.nocobase.com/img/flow.png" width="600" alt="Flow">',
    '   - Confirm, then it builds them.',
    '"Workspace")',
  ])
    expect(out).toContain(kept);
});

it('writes an empty article as nothing, and a new one from the editor', () => {
  const { editor: e, write } = open('');
  expect(write()).toBe('');
  e.commands.setContent('## Title\n\nFirst paragraph.', {
    contentType: 'markdown',
  });
  expect(write()).toBe('## Title\n\nFirst paragraph.');
});

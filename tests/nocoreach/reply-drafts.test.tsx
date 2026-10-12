import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ReplyDrafts, type ReplyDraft } from '../../client/pages/reply-drafts';
import { Markdown } from '../../client/pages/doc-view';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';

vi.mock('../../client/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
afterEach(() => {
  cleanup();
  setDictionary(null);
  vi.unstubAllGlobals();
});
const reply =
  '第一段 **客户关联**。\n\n第二段 `field`。\n\n- 客户\n- 重复字段\n\n1. 检查\n2. 确认\n\n```ts\nconst field = "客户";\n```\n\n[文档](https://example.com/docs)';
const draft: ReplyDraft = {
  title: '回复',
  url: '',
  asking: '',
  refs: '',
  gap: '',
  reply,
};

test('renders the same paragraphs, lists, emphasis, code and links as execution Markdown', () => {
  const { container } = render(<ReplyDrafts items={[draft]} />);
  const preview = container.querySelector('.nr-doc')!;
  expect(preview.querySelectorAll('p')).toHaveLength(3);
  expect(preview.querySelectorAll('ul li')).toHaveLength(2);
  expect(preview.querySelectorAll('ol li')).toHaveLength(2);
  expect(preview.querySelector('strong')).toHaveTextContent('客户关联');
  expect(preview.querySelector('p code')).toHaveTextContent('field');
  expect(preview.querySelector('pre code')).toHaveTextContent(
    'const field = "客户";',
  );
  expect(screen.getByRole('link', { name: '文档' })).toHaveAttribute(
    'href',
    'https://example.com/docs',
  );
  expect(screen.getByRole('link', { name: '文档' })).toHaveAttribute(
    'rel',
    'noreferrer',
  );
  const execution = render(<Markdown content={reply} />);
  expect(preview.innerHTML).toBe(
    execution.container.querySelector('.nr-doc')!.innerHTML,
  );
});

test('does not turn untrusted HTML or unsafe URLs into active content', () => {
  const unsafe =
    '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n<iframe src="https://example.com"></iframe>\n\n[bad](javascript:alert%281%29)\n\n[data](data:text/html;base64,PHNjcmlwdD4=)\n\n![image](javascript:alert%281%29)';
  const { container } = render(
    <ReplyDrafts items={[{ ...draft, reply: unsafe }]} />,
  );
  expect(container.querySelector('script, iframe, [onerror]')).toBeNull();
  for (const element of container.querySelectorAll('[href], [src]')) {
    expect(
      element.getAttribute('href') ?? element.getAttribute('src'),
    ).not.toMatch(/^(javascript|data):/i);
  }
});

test.each([false, true])(
  'copies the exact Markdown source with explicit localized labeling (English: %s)',
  async (en) => {
    setDictionary(en ? english : null);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const original = Object.freeze({ ...draft, reply: `  ${reply}\n\n` });
    render(<ReplyDrafts items={[original]} />);
    fireEvent.click(
      screen.getByRole('button', {
        name: en ? 'Copy Markdown source' : '复制 Markdown 原文',
      }),
    );
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(original.reply));
    expect(original.reply).toBe(`  ${reply}\n\n`);
  },
);

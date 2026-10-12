import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareLocale } from '../../client/i18n';
import { ReplyDrafts, type ReplyDraft } from '../../client/pages/reply-drafts';

const gap =
  '尚未说明会话隔离的配置。'.repeat(30) +
  'https://example.com/' +
  'a'.repeat(300);
const draft: ReplyDraft = {
  title: 'Session isolation',
  url: 'https://example.com/post',
  asking: 'How do I configure isolation?',
  refs: 'Guide',
  gap,
  reply: 'Please check the guide.',
};

afterEach(async () => {
  cleanup();
  await prepareLocale('zh-CN');
});

describe('reply draft documentation gaps', () => {
  it.each([
    ['zh-CN', '文档缺口', '复制 Markdown 原文', '打开原帖'],
    ['en-US', 'Docs gap', 'Copy Markdown source', 'Open post'],
  ])(
    'separates the short %s status from the complete explanation',
    async (locale, label, copy, open) => {
      await prepareLocale(locale);
      render(<ReplyDrafts items={[draft]} />);
      const status = screen.getByText(label);
      expect(status.getAttribute('data-slot')).toBe('tag');
      expect(status.textContent).toBe(label);
      expect(screen.getByText(gap).tagName).toBe('P');
      expect(screen.getByRole('button', { name: copy })).toBeTruthy();
      expect(
        screen.getByRole('link', { name: open }).getAttribute('href'),
      ).toBe(draft.url);
    },
  );

  it.each(['', '无', '没有', 'none', 'N/A', '-'])(
    'omits an absent gap (%s)',
    (value) => {
      render(<ReplyDrafts items={[{ ...draft, gap: value }]} />);
      expect(screen.queryByText('文档缺口')).toBeNull();
      expect(screen.getByText(draft.reply)).toBeTruthy();
    },
  );
});

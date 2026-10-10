import { afterEach, expect, test } from 'vitest';
import { setDictionary } from '../../client/i18n';
import en from '../../client/i18n/en.json';
import {
  materialNoticeText,
  reportDate,
} from '../../client/pages/task-detail/material-notices';

afterEach(() => setDictionary(null));
test('source notices translate their stable codes and numeric parameters into English', () => {
  setDictionary(en);
  const notices = [
    ['replies_unavailable', {}, 'Some existing replies could not be read'],
    [
      'post_truncated',
      { post: 3 },
      'Post 3 is too long and has been truncated',
    ],
    [
      'posts_incomplete',
      { expected: 105, provided: 100 },
      '100 of 105 posts are included',
    ],
    ['original_unavailable', {}, 'The original post could not be read'],
    [
      'forum_unavailable',
      {},
      'Forum content could not be read. Check the forum connection and outbound network, then retry.',
    ],
    [
      'metrics_unavailable',
      {},
      'Some project metrics could not be read. The existing task summary is still available.',
    ],
    [
      'topics_limit',
      { limit: 5 },
      'This task references more than 5 topics. Only the first 5 are included; split the task to read the rest.',
    ],
    [
      'budget_exceeded',
      { post: 7 },
      'Post 7 exceeds this task’s source budget and has been truncated',
    ],
    [
      'topic_link_missing',
      {},
      'No topic link from this project’s forum was found. Add the original topic link and check the forum connection.',
    ],
  ] as const;
  for (const [code, params, expected] of notices) {
    expect(materialNoticeText({ code, params, message: '服务端原文' })).toBe(
      expected,
    );
  }
});
test('report date formatting preserves ranges and uses the interface locale for ISO dates', () => {
  setDictionary(en);
  expect(reportDate('2026-10-11')).toBe('10/11/2026');
  expect(reportDate('2026-10-01 through 2026-10-11')).toBe(
    '2026-10-01 through 2026-10-11',
  );
  setDictionary(null);
  expect(reportDate('2026-10-11')).toBe('2026/10/11');
});

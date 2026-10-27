import { afterEach, expect, it } from 'vitest';
import english from '../../shared/i18n/en.json';
import { setDictionary } from '../../client/i18n';
import { keywordDraft } from '../../client/pages/keyword-hand-off';
import {
  competitorPagesDraft,
  queryDraft,
  replyDraft,
} from '../../client/pages/seo-hand-off';
import { combineDrafts } from '../../client/pages/hand-off-bar';

afterEach(() => setDictionary(null));

const keyword = (k: string) => ({
  keyword: k,
  market: null,
  volume: 100,
  difficulty: 10,
  intent: null,
});

// 2026-10-27 (T-49): a hand-off sends what the task is about, without what to do with it; the server titles the task
// "<playbook>: <subject>".
it('a hand-off names its subject without an action, in the interface language', () => {
  expect(keywordDraft([keyword('ai governance framework')]).subject).toBe(
    'ai governance framework',
  );
  const three = [
    keyword('ai governance framework'),
    keyword('ai risk'),
    keyword('ai policy'),
  ];
  expect(keywordDraft(three).subject).toBe(
    'ai governance framework 等 3 个关键词',
  );
  const rows = [
    { query: 'nocobase crm', clicks: 1, impressions: 10, position: 9 },
    { query: 'open source crm', clicks: 1, impressions: 10, position: 9 },
  ];
  expect(queryDraft(rows, undefined).subject).toBe('nocobase crm 等 2 个查询');
  expect(
    competitorPagesDraft('notion.so', 'US', [
      { url: 'https://www.notion.so/pricing', traffic: 1 } as never,
    ]).subject,
  ).toBe('notion.so/pricing');
  setDictionary(english);
  expect(keywordDraft(three).subject).toBe(
    '3 keywords, including ai governance framework',
  );
  expect(
    replyDraft('Reddit', 'posts', [
      { title: 'a', url: 'https://r/1' },
      { title: 'b', url: 'https://r/2' },
    ]).subject,
  ).toBe('2 posts from Reddit');
  // Several lists handed off together keep their subjects, only when each has one.
  expect(
    combineDrafts([
      { title: 'A', objective: 'a', brief: 'a', subject: 'x' },
      { title: 'B', objective: 'b', brief: 'b', subject: 'y' },
    ]).subject,
  ).toBe('x；y');
  expect(
    combineDrafts([
      { title: 'A', objective: 'a', brief: 'a', subject: 'x' },
      { title: 'B', objective: 'b', brief: 'b' },
    ]).subject,
  ).toBeUndefined();
});

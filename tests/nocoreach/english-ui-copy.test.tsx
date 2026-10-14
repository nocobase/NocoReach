import { afterEach, describe, expect, it } from 'vitest';
import english from '../../shared/i18n/en.json';
import { systemMessageText } from '../../shared/i18n/messages';
import {
  $legacyFragment,
  $legacyText,
  $t,
  setDictionary,
} from '../../client/i18n';
import { audit } from '../../server/nocoreach/audit.js';
import { auditSignals } from '../../server/nocoreach/signals.js';
import { StrategyService } from '../../server/nocoreach/strategy-service.js';
import { legacyContext } from '../../server/nocoreach/legacy/context';
import { chipOf, titleOf } from '../../client/pages/strategy/insights-view';
import {
  draftFromOpportunity,
  type Signal,
} from '../../client/pages/strategy/model';
import { stepOf } from '../../client/pages/task-list-model';
import type { Work } from '../../client/pages/task-execution-types';

afterEach(() => setDictionary(null));

const page = (path: string, extra: Record<string, unknown> = {}) => ({
  url: `https://x.dev${path}`,
  type: 'docs',
  fetchedAt: '2026-10-01T00:00:00Z',
  title: `Page ${path}`,
  description:
    'A description long enough to say what the page is about for search.',
  words: 400,
  h1: 1,
  ...extra,
});
const three = (prefix: string, extra: Record<string, unknown>) =>
  [1, 2, 3].map((n) => page(`/${prefix}${n}`, extra));
const site = {
  pages: [
    ...three('broken', { fetchError: '来源返回 404' }),
    ...three('noindex', { noindex: true }),
    ...three('untitled', { title: '' }),
    ...three('undescribed', { description: '' }),
    ...three('same', { title: 'Same' }),
  ],
};
const stored = (title: string, chip: string): Signal => ({
  key: 'audit-dupTitle',
  type: 'page',
  source: 'site',
  title,
  facts: [],
  strength: 1,
  chip: { tone: 'amber', text: chip },
  actionable: true,
  action: 'optimize',
});

describe('site audit changes', () => {
  it('keep the stored Chinese title of every audit change', () => {
    const issues = Object.fromEntries(
      audit(site).issues.map((i) => [i.type, i]),
    );
    const signals = auditSignals({ site });
    expect(signals.map((s) => s.key).sort()).toEqual([
      'audit-broken',
      'audit-dupTitle',
      'audit-noDescription',
      'audit-noTitle',
      'audit-noindex',
    ]);
    for (const s of signals) {
      const issue = issues[s.key.slice('audit-'.length)];
      expect(s.title).toBe(
        systemMessageText('messages.pages', { 0: issue.count, 1: issue.title }),
      );
      expect(s.chip.text).toBe('3 页');
    }
  });

  it('read new and stored audit titles and chips in English', () => {
    const signals = Object.fromEntries(
      auditSignals({ site }).map((s) => [s.key, s]),
    );
    setDictionary(english);
    expect(titleOf(signals['audit-broken'])).toBe("3 pages don't load");
    expect(titleOf(signals['audit-noindex'])).toBe(
      '3 pages are set to noindex',
    );
    expect(titleOf(signals['audit-noTitle'])).toBe(
      '3 pages are missing a title',
    );
    expect(titleOf(signals['audit-noDescription'])).toBe(
      '3 pages are missing a description',
    );
    expect(chipOf(signals['audit-noindex'])).toEqual({
      tone: 'red',
      text: '3 pages',
    });

    // Analyses saved before this change hold the same rendered Chinese text.
    const old = stored('16 个页面标题重复', '16 页');
    // The sentence reader does not guess at short fragments; chips use the fragment reader.
    expect($legacyText('16 页')).toBe('16 页');
    expect(titleOf(old)).toBe('16 pages have duplicate titles');
    expect(chipOf(old)?.text).toBe('16 pages');
    setDictionary(null);
    expect(titleOf(old)).toBe('16 个页面标题重复');
    expect(chipOf(old)?.text).toBe('16 页');
  });

  it('keeps sentence and chip caches separate in either read order', () => {
    setDictionary(english);
    expect($legacyFragment('16 页')).toBe('16 pages');
    expect($legacyText('16 页')).toBe('16 页');
    expect($legacyText('42 分')).toBe('42 分');
    expect($legacyFragment('42 分')).toBe('42 points');
  });

  it('read other one-character chips in English', () => {
    setDictionary(english);
    const text = (chip: string) => chipOf(stored('x', chip))?.text;
    expect(text('42 分')).toBe('42 points');
    expect(text('12 赞')).toBe('12 likes');
    expect(text('↓ 5 位')).toBe('↓ 5 positions');
    expect(text('↑ 2.4 倍')).toBe('↑ 2.4×');
    expect(text('↑ 32%')).toBe('↑ 32%');
  });
});

describe('task brief from an opportunity', () => {
  const card = {
    id: 'o-1',
    title: 'Fix duplicate titles',
    objective: 'Distinct titles for docs pages',
    meaning: 'm',
    suggestion: 'Rewrite the titles',
    observation: '16 pages share a title',
    evidenceText: 'Site audit',
    limitation: 'Only read pages',
  } as Parameters<typeof draftFromOpportunity>[0];

  it('labels the brief in the interface language', () => {
    setDictionary(english);
    expect(draftFromOpportunity(card).brief).toBe(
      'Suggestion: Rewrite the titles\n\nObservation: 16 pages share a title\n\nEvidence: Site audit\n\nLimitation: Only read pages',
    );
    setDictionary(null);
    expect(draftFromOpportunity(card).brief).toBe(
      '建议：Rewrite the titles\n\n观察：16 pages share a title\n\n依据：Site audit\n\n限制：Only read pages',
    );
  });

  it.each([
    ['en-US', 'Goal: Ship it\n\nDetails'],
    [undefined, '行动目标：Ship it\n\nDetails'],
  ])(
    'labels the stored goal in the request locale %s',
    async (locale, brief) => {
      const created: Record<string, unknown>[] = [];
      const service = new StrategyService({
        db: {
          getRepository: () => ({
            create: async ({ values }: { values: Record<string, unknown> }) => {
              created.push(values);
              return { id: 1 };
            },
          }),
        },
      });
      const state = { goal: null, proposals: [], insights: null };
      service.context = async () => ({ evidence: {} });
      service.mutate = async (_id, _v, fn) => {
        await fn(state, {});
        return state;
      };
      await service.confirmDirection(
        1,
        { title: 'Task', brief: 'Details', objective: 'Ship it' },
        { getCurrentLocale: () => locale },
      );
      expect(created[0].brief).toBe(brief);
      expect(created[0].status).toBe('待处理');
    },
  );

  it('exposes the request locale to classic actions', () => {
    const ctx = (locale?: string) =>
      legacyContext({
        resource: 'nrStrategy',
        action: 'confirmDirection',
        method: 'POST',
        query: {},
        body: {},
        header: () => undefined,
        cookie: () => undefined,
        user: null,
        roles: [],
        app: { db: {} } as never,
        cache: {} as never,
        logger: {} as never,
        locale,
      });
    expect(ctx('en-US').getCurrentLocale()).toBe('en-US');
    expect(ctx().getCurrentLocale()).toBeUndefined();
  });
});

describe('task list step', () => {
  const work = (kind: 'agent' | 'ai', name: string, run?: string) =>
    ({
      stage: 'flow',
      stageIndex: 0,
      flow: {
        id: 'custom',
        name: 'Custom',
        version: 1,
        stages: [{ key: 'custom', name, kind }],
      },
      ...(run ? { latestRun: { status: run } } : {}),
    }) as unknown as Work;

  it('retains the historical waiting key and template alias', () => {
    setDictionary(english);
    expect($t('taskList.waitingPickUp', { 0: 'Runner' })).toBe(
      'Waiting for Runner to pick it up',
    );
    expect($legacyText('等{0} 接手', { 0: 'Runner' })).toBe(
      'Waiting for Runner to pick it up',
    );
    setDictionary(null);
    expect($legacyText('等{0} 接手', { 0: 'Runner' })).toBe('等Runner 接手');
  });

  it('reads naturally in English and keeps the Chinese', () => {
    setDictionary(english);
    expect(stepOf(work('agent', 'Change'))?.text).toBe('Agent: Change');
    expect(stepOf(work('agent', 'Change', 'queued'))?.text).toBe(
      'Waiting for the agent to pick it up',
    );
    expect(stepOf(work('ai', 'Draft', 'queued'))?.text).toBe(
      'Waiting for online AI to pick it up',
    );
    setDictionary(null);
    expect(stepOf(work('agent', '修改'))?.text).toBe('Agent 正在修改');
    expect(stepOf(work('agent', '修改', 'queued'))?.text).toBe('等Agent 接手');
    expect(stepOf(work('ai', '起草', 'queued'))?.text).toBe('等在线 AI 接手');
  });
});

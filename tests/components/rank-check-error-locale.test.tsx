import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import english from '../../shared/i18n/en.json';
import chinese from '../../shared/i18n/zh.json';
import {
  setDictionary,
  translateDataForSeoReason,
  translateRankCheckError,
} from '../../client/i18n';
import { HealthLine, type HealthItem } from '../../client/pages/data-health';
import { researchRunError } from '../../client/pages/keyword-api';
import { RankTrackingTab } from '../../client/pages/rank-tracking-tab';

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { action, wrapRequests: vi.fn() },
  resolvePortalUrl: (path: string) => path,
}));
vi.mock('../../client/pages/current-project', () => ({
  currentProjectId: () => 1,
}));
vi.mock('../../client/pages/keyword-hand-off', () => ({
  DraftHandOffDialog: () => null,
}));
vi.mock('../../client/pages/strategy/hand-off', () => ({
  HandOffNotice: () => null,
}));
vi.mock('#components/reach/hand-off-slot', () => ({
  useHandOffSource: () => {},
}));
vi.mock('#components/app-shell/nav-badges', () => ({
  refreshNavSources: () => {},
}));
vi.mock('../../client/pages/keyword-api', async (original) => ({
  ...(await original<typeof import('../../client/pages/keyword-api')>()),
  useOpenKeyword: () => () => {},
}));

const CJK = /[一-鿿]/;
const zh = (key: keyof typeof chinese, vars: Record<string, string> = {}) =>
  chinese[key].replace(/\{(\d+)\}/g, (_, k: string) => vars[k] ?? '');
const en = (key: keyof typeof english, vars: Record<string, string> = {}) =>
  english[key].replace(/\{(\d+)\}/g, (_, k: string) => vars[k] ?? '');
const timeout = {
  zh: zh('dataforseo.dataforseoTookTooLongRespond'),
  en: en('dataforseo.dataforseoTookTooLongRespond'),
};
// Each reason a rank check stores (server/nocoreach/rank-tracking.ts and the DataForSEO layer), in Chinese as stored and in English.
const reasons: Array<[string, string, string]> = [
  ['not complete', zh('common.notComplete'), en('common.notComplete')],
  [
    'lookup failed',
    zh('rankTracking.searchResultsLookupFailed'),
    en('rankTracking.searchResultsLookupFailed'),
  ],
  [
    'not connected',
    zh('aiSearch.saveVerifyDataforseoDataSources'),
    en('aiSearch.saveVerifyDataforseoDataSources'),
  ],
  [
    'budget',
    zh('messages.monthDataforseoBudgetUsedUp', { 0: '4.99', 1: '5' }),
    en('messages.monthDataforseoBudgetUsedUp', { 0: '4.99', 1: '5' }),
  ],
  [
    'criteria changed',
    zh('dataforseo.queryCriteriaConnectionChangedRun'),
    en('dataforseo.queryCriteriaConnectionChangedRun'),
  ],
  [
    'invalid keyword',
    zh('keywordPolicy.keywords2100CharactersWithout'),
    en('keywordPolicy.keywords2100CharactersWithout'),
  ],
  [
    'timed out',
    zh('messages.resultUncertainMayChargedNot', { 0: timeout.zh }),
    en('messages.resultUncertainMayChargedNot', { 0: timeout.en }),
  ],
  [
    'uncertain',
    zh('messages.resultUncertainMayChargedNot'),
    en('messages.resultUncertainMayChargedNot'),
  ],
  [
    'provider error',
    zh('dataforseo.thirdPartyRequestFailedCheck'),
    en('dataforseo.thirdPartyRequestFailedCheck'),
  ],
];
// A keyword in English, one in Chinese, and ones holding full-width colons anywhere, also at the start or the end and
// in a row (the keyword check refuses only ":").
const keywords = [
  'ERPNext alternative',
  '开源 CRM',
  'CRM：开源',
  '没有完成：A',
  '：CRM',
  '：：CRM',
  'CRM：',
  '：：CRM：：开源',
];

afterEach(() => {
  cleanup();
  setDictionary(null);
  action.mockReset();
});

describe('rank check failures', () => {
  for (const keyword of keywords)
    for (const [name, stored, expected] of reasons)
      it(`reads "${keyword}" with ${name} in English and Chinese`, () => {
        const text = `${keyword}：${stored}`;
        setDictionary(english);
        const shown = translateRankCheckError(text);
        expect(shown).toBe(`${keyword}: ${expected}`);
        expect(shown.slice(keyword.length)).not.toMatch(CJK);
        setDictionary(null);
        expect(translateRankCheckError(text)).toBe(text);
      });

  it('keeps a reason the service did not write as it was, with the keyword in front', () => {
    setDictionary(english);
    expect(translateRankCheckError('kw：connection reset by peer')).toBe(
      'kw: connection reset by peer',
    );
  });

  it('keeps a keyword that begins with a colon whole when the reason is unknown', () => {
    setDictionary(english);
    expect(translateRankCheckError('：CRM：connection reset by peer')).toBe(
      '：CRM: connection reset by peer',
    );
  });

  it('reads a keyword that begins with a colon on Keywords › Rank tracking', async () => {
    const text = `：CRM：${zh('common.notComplete')}`;
    action.mockResolvedValue({
      lastRun: {
        at: '2026-11-01T00:00:00Z',
        ok: false,
        errors: [text],
        checked: 0,
      },
      keywords: [
        {
          id: 'k',
          keyword: '：CRM',
          locationCode: 2840,
          language: 'en',
          addedAt: '2026-10-01T00:00:00Z',
          latest: null,
          previous: null,
          history: [],
          nextCheckAt: null,
        },
      ],
    });
    setDictionary(english);
    render(
      <MemoryRouter>
        <RankTrackingTab />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText(
        "The last check didn't finish: ：CRM: Didn't complete",
      ),
    ).toBeTruthy();
  });

  it('shows the whole sentence on Keywords › Rank tracking in English and Chinese', async () => {
    const text = `ERPNext alternative：${zh('common.notComplete')}`;
    action.mockResolvedValue({
      lastRun: {
        at: '2026-11-01T00:00:00Z',
        ok: false,
        errors: [text],
        checked: 0,
      },
      keywords: [
        {
          id: 'k',
          keyword: 'ERPNext alternative',
          locationCode: 2840,
          language: 'en',
          addedAt: '2026-10-01T00:00:00Z',
          latest: null,
          previous: null,
          history: [],
          nextCheckAt: null,
        },
      ],
    });
    setDictionary(english);
    const view = render(
      <MemoryRouter>
        <RankTrackingTab />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText(
        "The last check didn't finish: ERPNext alternative: Didn't complete",
      ),
    ).toBeTruthy();
    view.unmount();
    setDictionary(null);
    render(
      <MemoryRouter>
        <RankTrackingTab />
      </MemoryRouter>,
    );
    expect(await screen.findByText(`上次检查有没完成的：${text}`)).toBeTruthy();
  });

  for (const keyword of ['开源 CRM', '：CRM'])
    it(`reads the rank row for "${keyword}" on Connections › Health in English`, () => {
      const stored = `${keyword}：${zh('messages.resultUncertainMayChargedNot')}`;
      const item: HealthItem = {
        id: 'rank',
        name: '排名跟踪',
        state: 'failing',
        message: stored,
        messageText: {
          key: 'dataHealth.extendedFailure',
          params: { 0: { systemError: stored } },
        },
        lastSuccessAt: null,
        dataThrough: null,
        nextSyncAt: null,
        retry: null,
      };
      setDictionary(english);
      render(<HealthLine item={item} />);
      const line = screen.getByText(
        new RegExp(en('messages.resultUncertainMayChargedNot').slice(0, 20)),
      );
      expect(line.textContent).toBe(
        en('dataHealth.extendedFailure', {
          0: `${keyword}: ${en('messages.resultUncertainMayChargedNot')}`,
        }),
      );
      expect(line.textContent!.replace(keyword, '')).not.toMatch(CJK);
    });
});

describe('Keywords › Research failures', () => {
  it('reads stored codes and sentences in English', () => {
    setDictionary(english);
    expect(researchRunError('provider_status_40501')).toBe(
      en('dataforseo.thirdPartyRequestFailedCheck'),
    );
    expect(researchRunError('research_schema_invalid')).toBe(
      en('common.lookupNotCompleteTryAgain'),
    );
    expect(
      researchRunError(
        zh('messages.resultUncertainMayChargedNot', { 0: timeout.zh }),
      ),
    ).toBe(en('messages.resultUncertainMayChargedNot', { 0: timeout.en }));
    expect(researchRunError(zh('messages.resultUncertainMayChargedNot'))).toBe(
      en('messages.resultUncertainMayChargedNot'),
    );
    expect(researchRunError(null)).toBe(en('common.notRunSameLookupAgain'));
    expect(
      translateDataForSeoReason(zh('rankTracking.searchResultsLookupFailed')),
    ).toBe(en('rankTracking.searchResultsLookupFailed'));
  });

  it('keeps stored Chinese sentences in Chinese', () => {
    const stored = zh('messages.resultUncertainMayChargedNot');
    expect(researchRunError(stored)).toBe(stored);
  });
});

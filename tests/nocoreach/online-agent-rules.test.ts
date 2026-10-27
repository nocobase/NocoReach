// @vitest-environment node
import { expect, test } from 'vitest';
import {
  analysisRulesTools,
  type RulesService,
  type RulesView,
} from '../../server/nocoreach/online-agent/rules-tools.js';
import {
  PAGE_CONTEXTS,
  pageContext,
} from '../../server/nocoreach/online-agent/page-context.js';
import type { NocoReachRuntime } from '../../server/providers/nocoreach.js';

const view = (): RulesView => ({
  revision: 'r1',
  schemeId: 'default',
  schemeName: 'Default',
  activeSchemeId: 'default',
  schemes: [{ id: 'default', name: 'Default' }],
  watchDays: 14,
  last: {
    computedAt: '2026-10-26T00:00:00Z',
    analyzedAt: '2026-10-26T01:00:00Z',
    found: 3,
    passed: 2,
  },
  rules: [
    {
      id: 'gsc-click-drop',
      source: 'gsc',
      sourceName: 'Search Console',
      label: 'Search clicks falling',
      description: 'Clicks fell clearly',
      enabled: true,
      found: 2,
      params: [
        {
          key: 'dropPct',
          label: 'Down at least',
          default: 30,
          min: 5,
          max: 90,
          unit: '%',
          value: 30,
        },
      ],
    },
    {
      id: 'custom-1',
      source: 'competitors',
      sourceName: 'Competitors',
      label: 'Competitor pricing',
      description: 'Pricing pages change',
      enabled: true,
      found: 0,
      custom: true,
      definition: {
        id: 'custom-1',
        name: 'Competitor pricing',
        source: 'competitors',
        condition: 'A pricing page changed',
        evidence: 'The page before and after',
      },
      params: [],
    },
  ],
});
function setup(grants: string[] = ['view', 'apply', 'addRule', 'updateRule']) {
  const rules: RulesService = {
    view: async () => view(),
    snapshot: async () => ({
      schemeId: 'default',
      revision: 'r1',
      catalog: view().rules.map((r) => ({
        id: r.id,
        source: r.source,
        label: r.label,
        params: r.params,
      })),
      config: { rules: {}, focus: '', watchDays: 14 },
      customRules: [view().rules[1].definition!],
    }),
  };
  const [read, propose] = analysisRulesTools({
    rules,
    projectId: '7',
    schemeId: 'default',
    authorize: async () => {},
    allowed: async (resource, action) =>
      resource === 'nrStrategy' || grants.includes(action),
    found: async () => [
      {
        ruleId: 'gsc-click-drop',
        title: '/pricing lost clicks',
        facts: ['-40%'],
      },
      { ruleId: 'other', title: 'Not this rule' },
    ],
  });
  const signal = new AbortController().signal;
  return {
    read: (args: object) => read.execute(args, signal),
    propose: (args: object) => propose.execute(args, signal),
  };
}

test('analysis_rules reads each rule with its numbers and the changes it found last time', async () => {
  const { read } = setup();
  const page = (await read({})) as { text: string; nextOffset: null };
  const data = JSON.parse(page.text);
  expect(data.scheme).toEqual({ id: 'default', name: 'Default', active: true });
  expect(data.rules[0]).toMatchObject({
    id: 'gsc-click-drop',
    enabled: true,
    numbers: [{ key: 'dropPct', value: 30, min: 5, max: 90 }],
    foundLastTime: 2,
    latestChanges: [{ title: '/pricing lost clicks', facts: ['-40%'] }],
  });
  expect(data.rules[1]).toMatchObject({
    custom: true,
    condition: 'A pricing page changed',
  });
  expect(await setup([]).read({})).toEqual({ accessDenied: true });
});

test('propose_rule_changes checks a new rule and a changed custom rule, one kind at a time', async () => {
  const { propose } = setup();
  const rule = {
    name: 'Competitor releases',
    source: 'competitors',
    condition: 'A competitor published a new version',
    evidence: 'The release page',
  };
  expect(await propose({ newRule: rule })).toMatchObject({
    proposal: {
      kind: 'newRule',
      revision: 'r1',
      newRule: { ...rule, sourceName: 'Competitors' },
    },
  });
  expect(
    await propose({ newRule: { ...rule, name: 'Competitor pricing' } }),
  ).toMatchObject({ rejected: true });
  expect(
    await propose({ newRule: { ...rule, source: 'nowhere' } }),
  ).toMatchObject({ rejected: true, reason: expect.stringContaining('gsc') });
  expect(
    await propose({
      editRule: { ...rule, ruleId: 'custom-1', name: 'Competitor pricing' },
    }),
  ).toMatchObject({
    proposal: {
      kind: 'editRule',
      editRule: {
        ruleId: 'custom-1',
        before: { condition: 'A pricing page changed' },
        after: { condition: 'A competitor published a new version' },
      },
    },
  });
  expect(
    await propose({ editRule: { ...rule, ruleId: 'gsc-click-drop' } }),
  ).toMatchObject({ rejected: true });
  expect(
    await propose({
      newRule: rule,
      changes: [
        {
          ruleId: 'gsc-click-drop',
          field: 'enabled',
          after: false,
          reason: 'x',
        },
      ],
    }),
  ).toMatchObject({ rejected: true });
  // Proposing needs the grant its Confirm will use.
  expect(await setup(['view', 'apply']).propose({ newRule: rule })).toEqual({
    accessDenied: true,
  });
});

test('a page context names the page; Analysis rules adds its rules, and a page it cannot read is only named', async () => {
  const plugin = {
    analysisRules: { view: async () => view() },
  } as unknown as NocoReachRuntime['plugin'];
  const allowed = async () => true;
  const rules = await pageContext({
    plugin,
    projectId: '7',
    subject: { kind: 'page', page: 'analysisRules', item: 'default' },
    allowed,
  });
  expect(rules).toContain('AI team › Analysis rules');
  expect(rules).toContain('"numbers":{"dropPct":30}');
  expect(
    await pageContext({
      plugin,
      projectId: '7',
      subject: { kind: 'page', page: 'analysisRules' },
      allowed: async () => false,
    }),
  ).toContain('may not see the rules');
  if (!PAGE_CONTEXTS.keywords)
    expect(
      await pageContext({
        plugin,
        projectId: '7',
        subject: { kind: 'page', page: 'keywords', item: 'nocobase "crm"' },
        allowed,
      }),
    ).toBe(
      `The user opened this conversation from Keywords, about "nocobase 'crm'".`,
    );
  const broken = {
    analysisRules: {
      view: async () => {
        throw new Error('gone');
      },
    },
  } as unknown as NocoReachRuntime['plugin'];
  expect(
    await pageContext({
      plugin: broken,
      projectId: '7',
      subject: { kind: 'page', page: 'analysisRules' },
      allowed,
    }),
  ).toBe('The user opened this conversation from AI team › Analysis rules.');
});

// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from '@nocobase/app-testing/server';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { describe, expect, test, onTestFinished } from 'vitest';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database';
import {
  AnalysisRules,
  RULES,
  normalize,
  resolver,
} from '../../server/nocoreach/analysis-rules';
import {
  materialOf,
  runSkills,
  verify,
} from '../../server/nocoreach/skill-analysis';
import {
  DEFAULT_ANALYSIS_SKILLS,
  SKILL_ANALYSIS,
  approxTokens,
  monthlySkillTokens,
} from '../../shared/skill-analysis';
import {
  RULE_CATEGORIES,
  RULE_TABS,
  ruleCategoryOf,
} from '../../shared/analysis-rule-categories';
import chinese from '../../shared/i18n/zh.json' with { type: 'json' };
import { applyVerdicts, endMissing } from '../../server/nocoreach/watch';

const LIBRARY = [
  'content-strategy',
  'competitors',
  'ai-seo',
  'seo-audit',
  'copy-editing',
  'schema-markup',
].map((name) => ({
  id: name,
  name,
  description: `Use for ${name}.`,
  builtIn: true,
}));
const USER_SKILL = {
  id: 'sk-1a2b3c4d',
  name: 'comparison-pages',
  description: 'Use when writing a comparison page.',
};
function library(skills = [...LIBRARY, USER_SKILL]) {
  return {
    skills,
    library: async () => ({ skills }),
    content: async (s: { name: string }) => ({
      body: `# ${s.name}\n${'Read the data by this method. '.repeat(40)}`,
      files: [],
    }),
  };
}

async function setup(extra: Record<string, unknown> = {}, skills = library()) {
  const db = await createTestDatabase({
    migrations: [
      {
        packageName: 'nocoreach',
        directory: fileURLToPath(
          new URL('../../database/main/migrations', import.meta.url),
        ),
      },
    ],
  });
  onTestFinished(() => db.destroy());
  const legacy = new LegacyDatabase(
    db.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  return {
    rules: new AnalysisRules({ db: legacy, skills, ...extra }),
    db: legacy,
    skills,
  };
}

describe('rules in the four opportunity categories', () => {
  test('every growth rule belongs to one category, the rest to Current situation', () => {
    const ids = RULES.map((r: { id: string }) => r.id);
    const growth = Object.values(RULE_CATEGORIES).flat();
    expect(new Set(growth).size).toBe(growth.length);
    expect(growth.every((id) => ids.includes(id))).toBe(true);
    expect(growth).toHaveLength(28);
    expect(RULE_TABS).toEqual([
      'trending',
      'new-content',
      'competitor-gaps',
      'optimize',
      'situation',
    ]);
    expect(ruleCategoryOf('keyword-demand')).toBe('new-content');
    expect(ruleCategoryOf('community-theme')).toBe('situation');
    expect(ruleCategoryOf('custom-1')).toBe('situation');
  });
  test('growth rules are named by the Opportunities type they find', () => {
    const label = (id: string) =>
      RULES.find((r: { id: string }) => r.id === id).label;
    expect(label('competitor-gap')).toBe(chinese['growth.kind.competitorGap']);
    expect(label('keyword-rising')).toBe('搜索量上升（关键词）');
    expect(label('trends-rising')).toBe('搜索量上升（Google Trends）');
    expect(label('community-theme')).toBe('社区高频词');
    // Every growth label is a current server text the pages translate.
    for (const id of Object.values(RULE_CATEGORIES).flat())
      expect(Object.values(chinese)).toContain(label(id));
  });
  test('a rule that ran in the last analysis of the scheme and found nothing shows 0', async () => {
    const last = {
      computedAt: '2026-11-17T00:00:00Z',
      analysisRunId: 'run-1',
      schemeId: 'default',
      schemeVersion: 1,
      found: { 'site-thin': 4 },
      total: 4,
      missing: [],
      ruleRuns: [
        { ruleId: 'site-thin', status: 'matched' },
        { ruleId: 'site-stale', status: 'not_matched' },
        { ruleId: 'youtube-new', status: 'insufficient' },
      ],
      skillRuns: [
        { skillId: 'content-strategy', status: 'ok', proposed: 2, found: 1 },
        { skillId: 'ai-seo', status: 'error', error: 'timeout' },
      ],
    };
    const { rules } = await setup({ signals: { last: async () => last } });
    const view = await rules.view('1');
    const rule = (id: string) =>
      view.rules.find((r: { id: string }) => r.id === id);
    expect(rule('site-thin').found).toBe(4);
    expect(rule('site-stale').found).toBe(0);
    expect(rule('youtube-new').found).toBeNull();
    expect(rule('rank').category).toBe('optimize');
    expect(view.last.skills).toEqual({ count: 2, found: 1 });
    expect(
      view.skills.selected.map((s: { id: string; run: unknown }) => [
        s.id,
        s.run,
      ]),
    ).toEqual([
      ['content-strategy', { status: 'ok', found: 1 }],
      ['competitors', null],
      ['ai-seo', { status: 'error', found: 0, error: 'timeout' }],
    ]);
  });
});

describe('Skills of an analysis scheme', () => {
  test('the default scheme starts with the three default Skills, once; a removal sticks', async () => {
    const { rules } = await setup();
    expect((await rules.activeSkills('1')).ids).toEqual([
      ...DEFAULT_ANALYSIS_SKILLS,
    ]);
    await rules.setSkill('1', { skillId: 'ai-seo', on: false });
    expect((await rules.activeSkills('1')).ids).toEqual([
      'content-strategy',
      'competitors',
    ]);
    await rules.setSkill('1', { skillId: 'competitors', on: false });
    await rules.setSkill('1', { skillId: 'content-strategy', on: false });
    expect((await rules.activeSkills('1')).ids).toEqual([]);
  });
  test('turning a Skill on twice keeps one; the sixth is refused; the rules keep their version', async () => {
    const { rules } = await setup();
    const before = await rules.view('1');
    await rules.setSkill('1', { skillId: 'content-strategy', on: true });
    await rules.setSkill('1', { skillId: 'seo-audit', on: true });
    await rules.setSkill('1', { skillId: USER_SKILL.id, on: true });
    const full = await rules.view('1');
    expect(full.skills.selected).toHaveLength(SKILL_ANALYSIS.max);
    expect(full.schemeVersion).toBe(before.schemeVersion);
    expect(full.storeRevision).toBeGreaterThan(before.storeRevision);
    await expect(
      rules.setSkill('1', { skillId: 'copy-editing', on: true }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      rules.setSkill('1', { skillId: 'no-such-skill', on: true }),
    ).rejects.toMatchObject({ status: 404 });
  });
  test('a copy keeps the Skills, a new scheme starts without; a deleted Skill leaves every scheme', async () => {
    const { rules } = await setup();
    const view = await rules.view('1');
    const copy = await rules.create('1', {
      name: 'Copy',
      copyFrom: 'default',
      storeRevision: view.storeRevision,
    });
    const blank = await rules.create('1', {
      name: 'Blank',
      storeRevision: copy.storeRevision,
    });
    expect(
      (await rules.view('1', copy.schemeId)).skills.selected.map(
        (s: { id: string }) => s.id,
      ),
    ).toEqual([...DEFAULT_ANALYSIS_SKILLS]);
    expect(blank.skills.selected).toEqual([]);
    await rules.setSkill('1', {
      skillId: 'competitors',
      on: true,
      schemeId: blank.schemeId,
    });
    await rules.forgetSkills(['competitors']);
    for (const id of ['default', copy.schemeId, blank.schemeId])
      expect(
        (await rules.view('1', id)).skills.selected.map(
          (s: { id: string }) => s.id,
        ),
      ).not.toContain('competitors');
  });
  test('Add Skill lists the library with what each adds a month, the chosen marked', async () => {
    const { rules, skills } = await setup();
    const choices = await rules.skillChoices('1', {});
    expect(choices.used).toBe(3);
    const user = choices.skills.find(
      (s: { id: string }) => s.id === USER_SKILL.id,
    );
    const body = (await skills.content(USER_SKILL)).body;
    expect(user).toMatchObject({ selected: false });
    expect(user.monthlyTokens).toBe(monthlySkillTokens(body));
    expect(
      choices.skills
        .filter((s: { selected: boolean }) => s.selected)
        .map((s: { id: string }) => s.id)
        .sort(),
    ).toEqual([...DEFAULT_ANALYSIS_SKILLS].sort());
  });
  test('a token estimate counts Latin text by four characters and each CJK character as one', () => {
    expect(approxTokens('abcdefgh')).toBe(2);
    expect(approxTokens('增长机会')).toBe(4);
    expect(monthlySkillTokens('')).toBe(
      (SKILL_ANALYSIS.dataTokens + SKILL_ANALYSIS.promptTokens) * 30,
    );
  });
});

// The day's data a Skill reads: keyword groups, Search Console pages, AI questions and community questions.
const inputs = {
  ks: {
    version: 2,
    groupNames: { g1: 'Approval workflow' },
    items: [
      ['approval workflow', 1300, 34, null],
      ['approval workflow software', 1000, 41, null],
      ['approval process template', 720, 29, null],
      ['kanban board', 2400, 52, 7.4],
    ].map(([keyword, volume, difficulty, position]) => ({
      keyword,
      group: 'g1',
      metrics: { volume, difficulty, monthlySearches: [] },
      ...(position ? { site: { position } } : {}),
    })),
  },
  queries: [
    {
      keyword: 'gantt chart template',
      page: 'https://acme.example/templates/gantt',
      impressions: 9000,
      clicks: 90,
      position: 8.2,
    },
  ],
  aq: [
    {
      question: 'What is the best approval workflow tool?',
      platform: 'chatgpt',
      status: 'gap',
      rivals: ['Nimbus'],
      brands: [],
    },
  ],
  td: { questions: [] },
};
const V = (() => {
  const r = resolver(normalize({}, RULES), RULES);
  return (id: string, key: string) => r.value(id, key);
})();

describe('a Skill candidate is kept only when its citations are in the data', () => {
  const material = materialOf(inputs);
  test('cited keywords without a page are demand with the growth computed from them', () => {
    const v = verify(
      {
        title: 'Cover approval workflows',
        keywords: ['Approval Workflow', 'approval process template'],
      },
      material,
      V,
      inputs.queries,
    );
    expect(v.found.growth.kind).toBe('demand-gap');
    expect(v.found.growth.category).toBe('new-content');
    expect(v.found.growth.figures[0].value).toBe(1300 + 720);
  });
  test('a page of the site close to the top grows by reaching it', () => {
    const v = verify(
      { pages: ['acme.example/templates/gantt/'] },
      material,
      V,
      inputs.queries,
    );
    expect(v.found.growth.category).toBe('optimize');
    expect(v.found.url).toBe('https://acme.example/templates/gantt');
  });
  test('an AI question naming others and not us is a competitor gap', () => {
    const v = verify(
      { questions: ['what is the best approval workflow tool?'] },
      material,
      V,
      inputs.queries,
    );
    expect(v.found.growth.kind).toBe('not-mentioned');
  });
  test('anything cited that is not in the data drops the candidate', () => {
    expect(
      verify(
        { keywords: ['approval workflow', 'invented keyword'] },
        material,
        V,
        inputs.queries,
      ),
    ).toEqual({ dropped: 'unmatched' });
    expect(verify({ title: 'No citations' }, material, V, [])).toEqual({
      dropped: 'unmatched',
    });
  });
});

describe('the daily Skill calls', () => {
  const skills = [
    { id: 'content-strategy', name: 'content-strategy' },
    { id: 'ai-seo', name: 'ai-seo' },
    { id: 'sk-empty000', name: 'empty-skill' },
  ];
  const p = {
    skills: {
      content: async (s: { id: string }) =>
        s.id === 'sk-empty000'
          ? { body: '', files: [] }
          : { body: `# ${s.id}\nMethod.`, files: [] },
    },
  };
  test('kept candidates become growth points naming the Skill; one failure leaves the others', async () => {
    const prompts: string[] = [];
    const { signals, runs } = await runSkills(p, {
      skills,
      inputs,
      V,
      language: 'en-US',
      complete: async (system: string, prompt: string) => {
        prompts.push(system);
        const { skill, data } = JSON.parse(prompt);
        expect(data.keywords[0].items[0]).not.toHaveProperty('months');
        if (skill === 'ai-seo') throw new Error('network');
        return JSON.stringify({
          candidates: [
            {
              title: 'Cover approval workflows',
              why: 'Three stages, one page.',
              keywords: ['approval workflow', 'approval workflow software'],
            },
            { title: 'Made up', keywords: ['invented keyword'] },
            // The same citations again are one growth point.
            {
              title: 'Again',
              keywords: ['approval workflow software', 'approval workflow'],
            },
          ],
        });
      },
    });
    expect(runs).toEqual([
      {
        skillId: 'content-strategy',
        name: 'content-strategy',
        status: 'ok',
        proposed: 3,
        found: 1,
      },
      { skillId: 'ai-seo', name: 'ai-seo', status: 'error', error: 'call' },
      {
        skillId: 'sk-empty000',
        name: 'empty-skill',
        status: 'error',
        error: 'empty',
      },
    ]);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      skill: { id: 'content-strategy', name: 'content-strategy' },
      growth: { kind: 'demand-gap' },
      chip: { tone: 'violet' },
    });
    expect(signals[0].key).toMatch(/^skill:content-strategy:demand-gap:/);
    expect(prompts[0]).toContain('<skill name="content-strategy">');
  });
  test('a reply that is not the asked JSON is an output failure', async () => {
    const { signals, runs } = await runSkills(p, {
      skills: skills.slice(0, 1),
      inputs,
      V,
      language: 'zh-CN',
      complete: async () => 'Here are some ideas.',
    });
    expect(signals).toEqual([]);
    expect(runs[0]).toMatchObject({ status: 'error', error: 'output' });
  });
});

// A Skill cites other rows from one day to the next for the same finding (2026-11-21: O-93 came back as O-108). The
// key follows what the growth rests on, so Ignore, Watching and hand-offs keyed by it hold the next day.
describe("a Skill's finding keeps its key from day to day", () => {
  const day = {
    ...inputs,
    ks: {
      ...inputs.ks,
      items: [
        ...inputs.ks.items,
        // Ranked in the top 3 already: no keyword growth, so a candidate citing it rests on its page.
        {
          keyword: 'gantt chart template',
          group: 'g1',
          metrics: { volume: 880, difficulty: 30, monthlySearches: [] },
          site: { position: 2.1 },
        },
      ],
    },
    cr: {
      market: { locationCode: 2840, language: 'en' },
      domains: {
        'nimbus.example': {
          market: '2840|en',
          gap: [
            ['approval process template', 720, 6],
            ['approval form template', 480, 4],
            ['purchase order approval', 390, 9],
          ].map(([keyword, volume, position]) => ({
            keyword,
            volume,
            difficulty: 25,
            position,
            url: 'https://nimbus.example/templates/approval',
          })),
          pages: [
            { url: 'https://nimbus.example/templates/approval', traffic: 2100 },
          ],
        },
      },
    },
    cw: { list: [{ name: 'Nimbus', site: 'https://nimbus.example' }] },
    aq: [
      ['What is the best approval workflow tool?', 300],
      ['Which tools automate purchase approvals?', 90],
      ['How do I route an approval to a manager?', 50],
    ].map(([question, volume]) => ({
      question,
      volume,
      platform: 'chat_gpt',
      status: 'gap',
      rivals: ['Nimbus'],
      brands: [],
      topics: ['approval workflow'],
    })),
    td: {
      questions: [
        {
          theme: 'How do I add an approval step?',
          query: 'approval step',
          ids: ['a', 'b', 'c', 'd', 'e'],
        },
        {
          theme: 'Approval email notifications',
          query: 'approval email',
          ids: ['f', 'g'],
        },
      ],
    },
  };
  const skill = { id: 'sk-52174b9c', name: 'comparison-pages' };
  const p = {
    skills: { content: async () => ({ body: '# Method', files: [] }) },
  };
  /** The keys one daily call of the Skill gives, the model replying with these candidates. */
  const keysOf = async (...candidates: Record<string, unknown>[]) =>
    (
      await runSkills(p, {
        skills: [skill],
        inputs: day,
        V,
        language: 'en-US',
        complete: async () => JSON.stringify({ candidates }),
      })
    ).signals.map((s: { key: string }) => s.key);

  test('other keywords for the same demand keep the key; the format is unchanged', async () => {
    const [monday] = await keysOf({
      title: 'Cover approval workflows',
      keywords: ['approval workflow', 'approval workflow software'],
    });
    const [tuesday] = await keysOf({
      title: 'Write an approval workflow guide',
      keywords: ['approval process template', 'Approval Workflow'],
    });
    expect(monday).toMatch(/^skill:sk-52174b9c:demand-gap:[0-9a-f]{12}$/);
    expect(tuesday).toBe(monday);
    // What `sameSignals` compares for cards resting on Skill findings alone.
    expect(monday.slice(0, monday.lastIndexOf(':'))).toBe(
      'skill:sk-52174b9c:demand-gap',
    );
  });

  test('a competitor page and the keywords it ranks for are one demand', async () => {
    const [monday] = await keysOf({
      title: 'Answer the competitor template page',
      pages: ['https://nimbus.example/templates/approval'],
    });
    const [tuesday] = await keysOf({
      title: 'Approval templates',
      keywords: ['approval form template', 'approval process template'],
    });
    expect(monday).toMatch(/^skill:sk-52174b9c:competitor-gap:/);
    expect(tuesday).toBe(monday);
  });

  test("the site's page keeps the key whatever else is cited and however its address is written", async () => {
    const [monday] = await keysOf({ pages: ['acme.example/templates/gantt/'] });
    const [tuesday] = await keysOf({
      keywords: ['gantt chart template'],
      pages: ['https://www.acme.example/templates/gantt'],
    });
    expect(monday).toMatch(/^skill:sk-52174b9c:near-first:/);
    expect(tuesday).toBe(monday);
  });

  test('questions keep the key by the one asked most', async () => {
    const ai = await keysOf(
      {
        questions: [
          'What is the best approval workflow tool?',
          'Which tools automate purchase approvals?',
        ],
      },
      {
        questions: [
          'How do I add an approval step?',
          'Approval email notifications',
        ],
      },
    );
    const next = await keysOf(
      {
        questions: [
          'How do I route an approval to a manager?',
          'what is the best approval workflow tool?',
        ],
      },
      { questions: ['How do I add an approval step?'] },
    );
    expect(ai[0]).toMatch(/^skill:sk-52174b9c:not-mentioned:/);
    expect(ai[1]).toMatch(/^skill:sk-52174b9c:asked-often:/);
    expect(next).toEqual(ai);
  });

  test('different demands get different keys; one demand cited twice is one finding', async () => {
    const keys = await keysOf(
      {
        title: 'Approval workflows',
        keywords: ['approval workflow', 'approval workflow software'],
      },
      { title: 'Approval templates', keywords: ['approval process template'] },
      // The same largest keyword: the same search, so the same finding.
      {
        title: 'Approval guide',
        keywords: ['approval process template', 'approval workflow'],
      },
    );
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    const questions = await keysOf(
      { questions: ['What is the best approval workflow tool?'] },
      { questions: ['Which tools automate purchase approvals?'] },
    );
    expect(new Set(questions).size).toBe(2);
    const pages = await keysOf(
      { pages: ['https://nimbus.example/templates/approval'] },
      { keywords: ['purchase order approval'] },
    );
    expect(new Set(pages).size).toBe(2);
  });

  test('a change being watched is still watched the next day', async () => {
    const run = async (keywords: string[]) =>
      (
        await runSkills(p, {
          skills: [skill],
          inputs: day,
          V,
          language: 'en-US',
          complete: async () => JSON.stringify({ candidates: [{ keywords }] }),
        })
      ).signals;
    const state: { watch?: Record<string, { ended?: unknown }> } = {};
    const monday = await run([
      'approval workflow',
      'approval workflow software',
    ]);
    applyVerdicts(state, {
      signals: monday,
      reviews: {
        [monday[0].key]: {
          verdict: 'watch',
          waitingFor: 'Searches keep rising',
        },
      },
      now: '2026-11-23T00:04:00.000Z',
    });
    endMissing(state, {
      signals: await run(['approval workflow', 'approval process template']),
      now: '2026-11-24T00:04:00.000Z',
    });
    expect(state.watch?.[monday[0].key]).toBeDefined();
    expect(state.watch?.[monday[0].key]?.ended).toBeUndefined();
  });
});

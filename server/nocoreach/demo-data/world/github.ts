import { githubDiscoveryFixture } from '../../../../app-plugins/nocoreach-mock/server/github-discovery.js';
import {
  DAY,
  HOUR,
  WorldUnsupported,
  body,
  cursorPage,
  escapeHtml,
  integer,
  json,
  notFound,
  object,
  restPage,
  text,
  textResponse,
  type Json,
} from './kit.js';
import { MAIN_REPOSITORY } from './script/github.js';
import {
  t,
  type Issue,
  type L,
  type Pull,
  type Repository,
} from './script/types.js';
import { level } from './series.js';
import type { World } from './world.js';

const AGE = 1100;

/** Other projects GitHub search and Trending show next to the demo's repository. */
const NEIGHBOURS: [
  repo: string,
  description: L,
  language: string,
  topics: string[],
  stars: number,
  age: number,
][] = [
  [
    'flowgrove/flowgrove',
    t(
      '云端工作流平台的开源运行器',
      'The open-source runner of the FlowGrove workflow cloud',
    ),
    'TypeScript',
    ['workflow', 'automation'],
    9400,
    700,
  ],
  [
    'stackmeadow/meadow',
    t('开发者优先的内部工具构建器', 'A developer-first internal tool builder'),
    'TypeScript',
    ['internal-tools', 'low-code'],
    14200,
    900,
  ],
  [
    'gridline/gridline-server',
    t(
      '像表格一样好用的数据库服务端',
      'The server behind a spreadsheet-like database',
    ),
    'Go',
    ['no-code', 'database'],
    22100,
    1300,
  ],
  [
    'formkit-labs/ai-form-filler',
    t('用大模型从文档中填写表单', 'Fill forms from documents with an LLM'),
    'Python',
    ['ai', 'forms'],
    1840,
    30,
  ],
  [
    'opsdesk/opsdesk',
    t('开源售后工单系统', 'An open-source helpdesk'),
    'TypeScript',
    ['helpdesk', 'self-hosted'],
    6300,
    600,
  ],
  [
    'ledgerly/ledgerly',
    t('面向小团队的开源进销存', 'Open-source inventory for small teams'),
    'Rust',
    ['inventory', 'erp'],
    3100,
    420,
  ],
  [
    'agentwork/agentwork',
    t(
      '业务系统里的 AI Agent 框架',
      'An AI agent framework for business systems',
    ),
    'Python',
    ['ai', 'agents', 'workflow'],
    12800,
    120,
  ],
  [
    'tinycrm/tinycrm',
    t('十分钟部署的轻量 CRM', 'A lightweight CRM deployed in ten minutes'),
    'JavaScript',
    ['crm', 'self-hosted'],
    2400,
    360,
  ],
  [
    'chartsmith/chartsmith',
    t('嵌入式图表与报表组件', 'Embeddable charts and reports'),
    'TypeScript',
    ['dashboard', 'charts'],
    7700,
    800,
  ],
  [
    'permit-kit/permit-kit',
    t('基于角色和属性的权限库', 'Role- and attribute-based access control'),
    'Go',
    ['rbac', 'security'],
    5200,
    650,
  ],
  [
    'workflow-labs/flowpilot',
    t('可视化编排的工作流引擎', 'A visually orchestrated workflow engine'),
    'Java',
    ['workflow', 'bpm'],
    8800,
    1000,
  ],
  [
    'quickform/quickform',
    t('拖拽式表单构建器', 'A drag-and-drop form builder'),
    'Vue',
    ['forms', 'no-code'],
    4100,
    500,
  ],
];

function repository(world: World, repo: string): Repository | undefined {
  if (world.main && repo === `${MAIN_REPOSITORY.owner}/${MAIN_REPOSITORY.name}`)
    return MAIN_REPOSITORY;
  return undefined;
}

type Numbered<T> = T & { number: number };

/** Issues, pull requests and discussions share GitHub's numbering, oldest first. */
function numbered(r: Repository) {
  const all = [
    ...r.issues.map((x) => ({
      kind: x.discussion ? ('discussion' as const) : ('issue' as const),
      item: x,
      opened: x.opened,
    })),
    ...r.pulls.map((x) => ({
      kind: 'pull' as const,
      item: x,
      opened: x.opened,
    })),
  ].sort((a, b) => b.opened - a.opened || 0);
  const count = all.length;
  return all.map((x, i) => ({
    ...x,
    number: 6100 + (count - i) * 3 + (i % 3),
  }));
}

function at(world: World, days: number, hours = 0): string {
  return new Date(world.now - days * DAY - hours * HOUR).toISOString();
}

function issueJson(
  world: World,
  repo: string,
  x: Numbered<Issue>,
  pullRequest?: Json,
): Json {
  const s = world.seeded;
  const hours = s.int(`ih:${x.number}`, 20);
  const updated =
    x.closed ?? Math.max(0, Math.min(x.opened, s.int(`iu:${x.number}`, 6)));
  return {
    id: s.id(`issue:${repo}:${x.number}`),
    node_id: `I_${s.hash(`node:${x.number}`).slice(0, 16)}`,
    number: x.number,
    title: world.text(x.title),
    body: world.text(x.body),
    state: x.closed !== undefined ? 'closed' : 'open',
    state_reason: x.closed !== undefined ? 'completed' : null,
    html_url: `https://github.com/${repo}/${pullRequest ? 'pull' : 'issues'}/${x.number}`,
    user: { login: world.person(x.author) },
    author_association: authorRole(x.author),
    labels: x.labels.map((name) => ({
      name,
      color: LABEL_COLOR[name] ?? 'ededed',
    })),
    comments: x.comments,
    reactions: {
      total_count: x.reactions,
      '+1': Math.ceil(x.reactions * 0.7),
      heart: Math.floor(x.reactions * 0.2),
    },
    created_at: at(world, x.opened, hours),
    updated_at: at(world, updated, hours / 2),
    closed_at: x.closed !== undefined ? at(world, x.closed, 2) : null,
    ...(pullRequest ? { pull_request: pullRequest } : {}),
  };
}

const LABEL_COLOR: Record<string, string> = {
  bug: 'd73a4a',
  feature: 'a2eeef',
  documentation: '0075ca',
  question: 'd876e3',
  'good first issue': '7057ff',
  'needs reproduction': 'fbca04',
  '2.0': '1d76db',
  upgrade: 'c5def5',
  security: 'b60205',
  performance: 'f9d0c4',
};

function authorRole(login: string): string {
  const person = MAIN_REPOSITORY.people.find((p) => p.login === login);
  return person?.team
    ? 'MEMBER'
    : person?.bot
      ? 'NONE'
      : login.startsWith('@')
        ? 'MEMBER'
        : 'CONTRIBUTOR';
}

function pullJson(world: World, repo: string, x: Numbered<Pull>): Json {
  const closed = x.merged ?? x.closed;
  const issueLike: Numbered<Issue> = {
    number: x.number,
    title: x.title,
    body: t('', ''),
    labels: x.author.endsWith('[bot]') ? ['dependencies'] : [],
    author: x.author,
    opened: x.opened,
    ...(closed !== undefined ? { closed } : {}),
    comments: x.comments,
    reactions: Math.floor(x.comments / 2),
  };
  return issueJson(world, repo, issueLike, {
    url: `https://api.github.com/repos/${repo}/pulls/${x.number}`,
    html_url: `https://github.com/${repo}/pull/${x.number}`,
    merged_at: x.merged !== undefined ? at(world, x.merged, 3) : null,
  });
}

function commits(world: World, r: Repository, repo: string): Json[] {
  const items = numbered(r);
  const merged = items
    .filter((x) => x.kind === 'pull' && x.item.merged !== undefined)
    .map((x) => ({
      message: `${world.text(x.item.title)} (#${x.number})`,
      author: (x.item as Pull).author,
      days: (x.item as Pull).merged!,
    }));
  const team = r.people.filter((p) => p.team).map((p) => p.login);
  const own = r.commits.map((message, i) => ({
    message: world.text(message),
    author: team[i % team.length],
    days: Math.round(i * 4 + world.seeded.int(`cd:${i}`, 3)),
  }));
  return [...merged, ...own]
    .sort((a, b) => a.days - b.days)
    .map((c, i) => {
      const date = at(world, c.days, 1 + world.seeded.int(`ch:${i}`, 9));
      return {
        sha: world.seeded.hash(`commit:${repo}:${c.message}`).slice(0, 40),
        html_url: `https://github.com/${repo}/commit/${world.seeded.hash(`commit:${repo}:${c.message}`).slice(0, 40)}`,
        author: { login: world.person(c.author) },
        commit: {
          message: c.message,
          author: { name: world.person(c.author), date },
          committer: { name: 'GitHub', date },
        },
      };
    });
}

/** Stars (or forks) given each day, oldest first, adding up to the repository's total today. */
function perDay(
  world: World,
  r: Repository,
  kind: 'stars' | 'forks',
): number[] {
  return world.memo(`github:${kind}`, () => countDays(world, r, kind));
}
/** The total today: the script's figure on 2026-10-01, growing at its pace since, so daily samples move. */
function total(world: World, r: Repository, kind: 'stars' | 'forks'): number {
  const elapsed = Math.floor(
    (world.now - Date.parse('2026-10-01T00:00:00Z')) / DAY,
  );
  const pace =
    kind === 'stars'
      ? r.stars.perDay
      : r.stars.perDay * (r.forks / r.stars.total);
  return Math.round(
    (kind === 'stars' ? r.stars.total : r.forks) + elapsed * pace,
  );
}

function countDays(
  world: World,
  r: Repository,
  kind: 'stars' | 'forks',
): number[] {
  const all = total(world, r, kind);
  const pace =
    kind === 'stars'
      ? r.stars.perDay
      : r.stars.perDay * (r.forks / r.stars.total);
  const raw = Array.from({ length: AGE }, (_, i) => {
    const ago = AGE - 1 - i;
    // The repository grew into its pace: early days had a fraction of today's.
    const ramp = 0.35 + 0.65 * Math.min(1, (AGE - ago) / AGE) ** 0.6;
    return (
      pace *
      ramp *
      level(r.stars.changes, ago) *
      world.seeded.jitter(`${kind}:${ago}`, 0.35)
    );
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  let cumulative = 0;
  let given = 0;
  return raw.map((v) => {
    cumulative += (v / sum) * all;
    const count = Math.round(cumulative) - given;
    given += count;
    return count;
  });
}

function timestamps(
  world: World,
  r: Repository,
  kind: 'stars' | 'forks',
): string[] {
  return world.memo(`github:${kind}:times`, () => {
    const out: string[] = [];
    perDay(world, r, kind).forEach((count, i) => {
      const ago = AGE - 1 - i;
      for (let k = 0; k < count; k++)
        out.push(at(world, ago, 23 - ((k * 7) % 24)));
    });
    return out;
  });
}

function trafficDays(world: World, kind: 'views' | 'clones') {
  const out = [];
  for (let ago = 14; ago >= 1; ago--) {
    const date = new Date(world.now - ago * DAY).toISOString().slice(0, 10);
    const base = kind === 'views' ? 2600 : 310;
    const count = Math.round(
      base *
        level(MAIN_REPOSITORY.stars.changes, ago) ** 0.5 *
        world.seeded.jitter(`${kind}:${date}`, 0.2),
    );
    out.push({
      timestamp: `${date}T00:00:00Z`,
      count,
      uniques: Math.round(count * (kind === 'views' ? 0.31 : 0.42)),
    });
  }
  return out;
}

function repoName(u: URL, b: Json): string {
  const matched = u.pathname.match(/^\/repos\/([^/]+\/[^/]+)/)?.[1];
  const q = u.searchParams.get('q')?.match(/repo:([^ ]+)/)?.[1];
  const vars = object(b.variables);
  return (
    matched ||
    q ||
    (vars.owner && vars.name ? `${text(vars.owner)}/${text(vars.name)}` : '')
  );
}

function searchRepositories(world: World, u: URL) {
  const q = u.searchParams.get('q') ?? '';
  const topic = q.match(/topic:([a-z0-9-]+)/)?.[1] ?? null;
  const created = q.match(/created:(\S+)/)?.[1] ?? null;
  const per = Math.min(100, integer(u.searchParams.get('per_page'), 30));
  const all = [
    ...NEIGHBOURS,
    ...(world.main
      ? [
          [
            `nocobase/nocobase`,
            MAIN_REPOSITORY.description,
            'TypeScript',
            [...MAIN_REPOSITORY.topics],
            MAIN_REPOSITORY.stars.total,
            AGE,
          ] as (typeof NEIGHBOURS)[number],
        ]
      : []),
  ].filter(
    ([, , , topics, , age]) =>
      (!topic || topics.includes(topic)) && (!created || age <= 7),
  );
  const total = created
    ? all.length + world.seeded.int(`created:${topic}:${created}`, 60)
    : topic
      ? 800 + world.seeded.int(`topic:${topic}`, 40_000)
      : all.length;
  return json({
    total_count: total,
    incomplete_results: false,
    items: all
      .sort((a, b) => b[4] - a[4])
      .slice(0, per)
      .map(([repo, description, language, topics, stars, age]) => ({
        full_name: repo,
        html_url: `https://github.com/${repo}`,
        description: world.text(description),
        language,
        topics,
        stargazers_count: stars,
        created_at: at(world, age),
      })),
  });
}

function trending(world: World, u: URL): Response {
  const since = u.searchParams.get('since') ?? 'daily';
  const word =
    since === 'weekly'
      ? 'this week'
      : since === 'monthly'
        ? 'this month'
        : 'today';
  const scale = since === 'weekly' ? 6 : since === 'monthly' ? 22 : 1;
  const rows = [...NEIGHBOURS]
    .sort(
      (a, b) =>
        world.seeded.unit(`tr:${since}:${a[0]}`) -
        world.seeded.unit(`tr:${since}:${b[0]}`),
    )
    .slice(0, 10)
    .map(([repo, description, language, , stars], i) => {
      const [owner, name] = repo.split('/');
      const gained = Math.round(
        (60 + world.seeded.int(`gain:${since}:${repo}`, 400)) * scale,
      );
      return `<article class="Box-row"><h2 class="h3 lh-condensed"><a href="/${repo}" class="Link"><svg aria-hidden="true"></svg><span class="text-normal">${owner} /</span> ${name}</a></h2><p class="col-9 color-fg-muted my-1">${escapeHtml(world.text(description))}</p><div class="f6 color-fg-muted mt-2"><span itemprop="programmingLanguage">${language}</span><a href="/${repo}/stargazers" class="Link"><svg aria-label="star"></svg> ${stars.toLocaleString('en-US')}</a><a href="/${repo}/forks" class="Link"><svg aria-label="fork"></svg> ${Math.round(stars / 9 + i).toLocaleString('en-US')}</a><span class="d-inline-block float-sm-right"><svg aria-hidden="true"></svg> ${gained.toLocaleString('en-US')} stars ${word}</span></div></article>`;
    });
  return textResponse(
    `<!doctype html><html><body><main>${rows.join('')}</main></body></html>`,
    'text/html; charset=utf-8',
  );
}

export function github(
  world: World,
  u: URL,
  init: RequestInit,
): Response | undefined {
  if (u.hostname === 'github.com' && u.pathname === '/trending')
    return trending(world, u);
  if (u.hostname === 'raw.githubusercontent.com') {
    const m = u.pathname.match(/^\/([^/]+\/[^/]+)\/(?:main|HEAD)\/README\.md$/);
    const r = m ? repository(world, m[1]) : undefined;
    return r ? textResponse(world.text(r.readme)) : notFound();
  }
  if (u.hostname !== 'api.github.com') return undefined;
  const discovery = githubDiscoveryFixture(u);
  if (discovery) return discovery;
  const b = body(init);
  const p = u.pathname;
  if (p === '/search/repositories') return searchRepositories(world, u);
  const members = p.match(/^\/orgs\/([^/]+)\/public_members$/);
  if (members)
    return members[1] === MAIN_REPOSITORY.owner && world.main
      ? json(
          restPage(
            MAIN_REPOSITORY.people
              .filter((x) => x.team)
              .map((x) => ({ login: x.login })),
            u,
          ),
        )
      : notFound();
  const repo = repoName(u, b);
  if (p === '/graphql') {
    const query = text(b.query);
    if (/\bmutation\b/.test(query))
      throw new WorldUnsupported('a GitHub mutation');
    if (query.includes('stargazerCount'))
      return json({
        data: Object.fromEntries(
          [
            ...query.matchAll(
              /(r\d+):repository\(owner:"([^"]+)",name:"([^"]+)"\)/g,
            ),
          ].map(([, alias, owner, name]) => {
            const full = `${owner}/${name}`;
            const own = repository(world, full);
            const stars =
              (own && total(world, own, 'stars')) ??
              NEIGHBOURS.find((n) => n[0] === full)?.[4] ??
              0;
            return [alias, { nameWithOwner: full, stargazerCount: stars }];
          }),
        ),
      });
    const r = repository(world, repo);
    if (!r)
      return json({
        data: { repository: null },
        errors: [
          {
            type: 'NOT_FOUND',
            message: `Could not resolve to a Repository with the name '${repo}'.`,
          },
        ],
      });
    const vars = object(b.variables);
    if (query.includes('discussions')) {
      const rows = numbered(r)
        .filter((x) => x.kind === 'discussion')
        .map((x) => {
          const d = x.item as Issue;
          return {
            id: `D_${world.seeded.hash(`d:${x.number}`).slice(0, 12)}`,
            number: x.number,
            title: world.text(d.title),
            url: `https://github.com/${repo}/discussions/${x.number}`,
            body: world.text(d.body),
            createdAt: at(world, d.opened, 4),
            updatedAt: at(world, Math.max(0, d.opened - 2)),
            upvoteCount: d.reactions,
            isAnswered: Boolean(d.discussion?.answered),
            comments: { totalCount: d.comments },
            category: {
              name: d.discussion!.category,
              isAnswerable: d.discussion!.category === 'Q&A',
            },
          };
        });
      const page = cursorPage(rows, vars.after, 100);
      return json({
        data: {
          repository: {
            hasDiscussionsEnabled: true,
            discussions: {
              totalCount: rows.length,
              nodes: page.items,
              pageInfo: {
                hasNextPage: Boolean(page.next),
                endCursor: page.next || null,
              },
            },
          },
        },
      });
    }
    const kind = query.includes('stargazers')
      ? 'stars'
      : query.includes('forks')
        ? 'forks'
        : null;
    if (!kind) throw new WorldUnsupported('this GitHub GraphQL selection');
    const rows = timestamps(world, r, kind).map((when) =>
      kind === 'stars' ? { starredAt: when } : { createdAt: when },
    );
    const page = cursorPage(rows, vars.after, 100);
    const field = kind === 'stars' ? 'stargazers' : 'forks';
    return json({
      data: {
        repository: {
          [field]: {
            totalCount: rows.length,
            [kind === 'stars' ? 'edges' : 'nodes']: page.items,
            pageInfo: {
              hasNextPage: Boolean(page.next),
              endCursor: page.next || null,
            },
          },
        },
      },
    });
  }
  const r = repository(world, repo);
  if (!r)
    return json(
      {
        message: 'Not Found',
        documentation_url: 'https://docs.github.com/rest',
      },
      404,
    );
  const items = numbered(r);
  const issues = () =>
    items
      .filter((x) => x.kind === 'issue')
      .map((x) =>
        issueJson(world, repo, { ...(x.item as Issue), number: x.number }),
      );
  const pulls = () =>
    items
      .filter((x) => x.kind === 'pull')
      .map((x) => pullJson(world, repo, { ...x.item, number: x.number }));
  if (p === `/repos/${repo}`)
    return json({
      id: world.seeded.id(`repo:${repo}`),
      name: r.name,
      full_name: repo,
      private: false,
      html_url: `https://github.com/${repo}`,
      description: world.text(r.description),
      homepage: world.origin,
      stargazers_count: total(world, r, 'stars'),
      watchers_count: total(world, r, 'stars'),
      forks_count: total(world, r, 'forks'),
      subscribers_count: r.watchers,
      open_issues_count:
        issues().filter((i) => i.state === 'open').length +
        pulls().filter((i) => i.state === 'open').length,
      has_discussions: true,
      default_branch: 'main',
      language: 'TypeScript',
      topics: r.topics,
      license: {
        key: 'agpl-3.0',
        spdx_id: 'AGPL-3.0',
        name: 'GNU Affero General Public License v3.0',
      },
      created_at: at(world, AGE),
      updated_at: at(world, 0, 2),
      pushed_at: at(world, 0, 3),
    });
  if (p === '/search/issues') {
    const q = u.searchParams.get('q') ?? '';
    const createdSince = q.match(/created:>=(\d{4}-\d{2}-\d{2})/)?.[1];
    let rows = issues();
    if (q.includes('is:pr')) rows = pulls();
    if (createdSince)
      rows = rows.filter((i) => String(i.created_at) >= createdSince);
    if (q.includes('is:open')) rows = rows.filter((i) => i.state === 'open');
    if (u.searchParams.get('sort') === 'comments')
      rows.sort((a, b) => integer(b.comments) - integer(a.comments));
    return json({
      total_count: rows.length,
      incomplete_results: false,
      items: restPage(rows, u, 30),
    });
  }
  const suffix = p.slice(`/repos/${repo}`.length);
  const since = u.searchParams.get('since');
  if (suffix === '/issues') {
    const state = u.searchParams.get('state') ?? 'open';
    const rows = [...issues(), ...pulls()]
      .filter((i) => state === 'all' || i.state === state)
      .filter((i) => !since || String(i.updated_at) >= since)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return json(restPage(rows, u));
  }
  const single = suffix.match(/^\/issues\/(\d+)$/);
  if (single) {
    const row = [...issues(), ...pulls()].find(
      (i) => i.number === Number(single[1]),
    );
    return row ? json(row) : notFound();
  }
  if (suffix === '/commits')
    return json(
      restPage(
        commits(world, r, repo).filter(
          (c) =>
            !since || String(object(object(c.commit).author).date) >= since,
        ),
        u,
      ),
    );
  if (suffix === '/languages') return json(r.languages);
  if (suffix === '/contributors') {
    const counts = new Map<string, number>();
    for (const c of commits(world, r, repo)) {
      const login = text(object(c.author).login);
      counts.set(login, (counts.get(login) ?? 0) + 1);
    }
    return json(
      restPage(
        [...counts.entries()]
          .map(([login, n]) => ({
            login,
            contributions: n * 23 + world.seeded.int(`contrib:${login}`, 40),
            html_url: `https://github.com/${login.replace('[bot]', '')}`,
          }))
          .sort((a, b) => b.contributions - a.contributions),
        u,
      ),
    );
  }
  const releases = r.releases.map((x) => ({
    id: world.seeded.id(`release:${x.tag}`),
    tag_name: x.tag,
    name: world.text(x.name),
    body: world.text(x.notes),
    html_url: `https://github.com/${repo}/releases/tag/${x.tag}`,
    draft: false,
    prerelease: Boolean(x.prerelease),
    created_at: at(world, x.age, 6),
    published_at: at(world, x.age, 5),
    assets: [
      {
        name: `nocobase-${x.tag}.tar.gz`,
        download_count: Math.round(400 + (2000 / (x.age + 2)) * 20),
      },
    ],
  }));
  if (suffix === '/releases') return json(restPage(releases, u));
  if (suffix === '/releases/latest')
    return json(releases.find((x) => !x.prerelease));
  const release = suffix.match(/^\/releases\/(?:tags\/)?([^/]+)$/);
  if (release) {
    const row = releases.find(
      (x) => String(x.id) === release[1] || x.tag_name === release[1],
    );
    return row ? json(row) : notFound();
  }
  if (suffix === '/traffic/views' || suffix === '/traffic/clones') {
    const kind = suffix.endsWith('views') ? 'views' : 'clones';
    const rows = trafficDays(world, kind);
    return json({
      count: rows.reduce((n, x) => n + x.count, 0),
      uniques: Math.round(rows.reduce((n, x) => n + x.uniques, 0) * 0.55),
      [kind]: rows,
    });
  }
  if (suffix === '/traffic/popular/referrers')
    return json([
      { referrer: 'Google', count: 4120, uniques: 1980 },
      { referrer: world.project.domain, count: 2630, uniques: 1410 },
      { referrer: 'news.ycombinator.com', count: 1180, uniques: 960 },
      {
        referrer: world.lang === 'zh' ? 'zhihu.com' : 'reddit.com',
        count: 610,
        uniques: 430,
      },
      { referrer: 'github.com', count: 540, uniques: 300 },
      {
        referrer: world.lang === 'zh' ? 'juejin.cn' : 'dev.to',
        count: 310,
        uniques: 220,
      },
    ]);
  if (suffix === '/traffic/popular/paths')
    return json(
      [
        ['', r.name],
        ['/releases', 'Releases'],
        ['/blob/main/README.md', 'README.md'],
        ['/issues', 'Issues'],
        ['/discussions', 'Discussions'],
        ['/blob/main/docker-compose.yml', 'docker-compose.yml'],
      ].map(([path, title], i) => ({
        path: `/${repo}${path}`,
        title,
        count: Math.round(9800 / (i + 1.3)),
        uniques: Math.round(3100 / (i + 1.5)),
      })),
    );
  if (suffix === '/stargazers/history') {
    const days = perDay(world, r, 'stars');
    const weeks: { week: number; days: number[] }[] = [];
    const today = Date.parse(new Date(world.now).toISOString().slice(0, 10));
    const sunday = today - new Date(today).getUTCDay() * DAY;
    for (let w = 0; w * 7 < AGE; w++) {
      const start = sunday - w * 7 * DAY;
      weeks.push({
        week: start / 1000,
        days: Array.from({ length: 7 }, (_, d) => {
          const ago = Math.round((today - (start + d * DAY)) / DAY);
          return ago < 0 || ago >= AGE ? 0 : days[AGE - 1 - ago];
        }),
      });
    }
    return json(restPage(weeks, u, 30));
  }
  if (suffix === '/stargazers' || suffix === '/forks') {
    const kind = suffix === '/stargazers' ? 'stars' : 'forks';
    const rows = timestamps(world, r, kind).map((when, i) =>
      kind === 'stars'
        ? { starred_at: when, user: { login: `stargazer-${i + 1}` } }
        : {
            id: world.seeded.id(`fork:${i}`),
            created_at: when,
            full_name: `fork-${i + 1}/${r.name}`,
            html_url: `https://github.com/fork-${i + 1}/${r.name}`,
          },
    );
    return json(restPage(rows, u));
  }
  if (suffix === '/git/trees/main')
    return json({
      sha: world.seeded.hash('tree'),
      truncated: false,
      tree: ['README.md', 'docker-compose.yml', 'package.json', 'packages'].map(
        (path) => ({
          path,
          mode: path === 'packages' ? '040000' : '100644',
          type: path === 'packages' ? 'tree' : 'blob',
          sha: world.seeded.hash(path),
        }),
      ),
    });
  if (suffix.startsWith('/contents')) {
    const requested = decodeURIComponent(suffix.replace(/^\/contents\/?/, ''));
    if (!requested)
      return json(
        ['README.md', 'docker-compose.yml', 'package.json'].map((name) => ({
          name,
          path: name,
          type: 'file',
          download_url: `https://raw.githubusercontent.com/${repo}/main/${name}`,
        })),
      );
    if (requested === 'README.md') {
      const content = world.text(r.readme);
      return json({
        name: requested,
        path: requested,
        type: 'file',
        encoding: 'base64',
        content: Buffer.from(content).toString('base64'),
        sha: world.seeded.hash(requested),
        size: Buffer.byteLength(content),
      });
    }
    return notFound();
  }
  return undefined;
}

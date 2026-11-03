import {
  authenticationToken,
  isServiceAccount,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import { scopedApiKeysToken } from '@nocobase/app-plugin-api-keys/server';
import {
  ApiError,
  apiErrorResponses,
  apiValidator,
  cliRoute,
  dataResponse,
  defineApiRoutes,
  describeRoute,
} from '@nocobase/app-server/router';
import type { Application } from '@nocobase/app-server/application';
import { getRequestLocale } from '@nocobase/i18n/server';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { nocoReachToken } from '../providers/nocoreach.js';
import { legacyContext, LegacyHttpError } from '../nocoreach/legacy/context.js';
import { requireAccess, roleOf } from '../nocoreach/policy.js';
import { businessApiError } from '../nocoreach/api-error.js';
import { systemMessageText } from '../../shared/i18n/messages.js';
import {
  CONNECT_SOURCES,
  connectSource,
  connectionState,
  type StatusInput,
} from '../../shared/connect-sources.js';

// `nocoreach connect …`: a person's own agent connects the public data sources of a project from the command line,
// through the same NocoReach actions, grants and network routes as the Data sources page. Credentials, OAuth and
// Collectors stay on the page: these routes take none, and answer such a source with its page instead.

type Env = AuthEnv & AuthorizationEnv;
const ProjectId = z.string().regex(/^[1-9]\d{0,15}$/);
const ProjectQuery = z.strictObject({ projectId: ProjectId });
const DiscoverInput = z.strictObject({
  projectId: ProjectId,
  url: z.string().trim().min(1).max(2000),
});
const ConnectInput = z.strictObject({
  projectId: ProjectId,
  source: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
  url: z.string().trim().min(1).max(2000).optional(),
  registry: z.enum(['npm', 'pypi', 'docker']).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  terms: z.string().trim().min(1).max(500).optional(),
  site: z.string().trim().min(1).max(2000).optional(),
  repo: z.string().trim().min(1).max(300).optional(),
});
type Connect = z.infer<typeof ConnectInput>;

const SourceView = z.object({
  id: z.string(),
  name: z.string(),
  state: z.string(),
  via: z.enum(['cli', 'browser']),
  requires: z.string().nullable(),
  needs: z.array(z.string()),
  url: z.string(),
});
const BrowserHandOff = z.object({
  requiresBrowser: z.literal(true),
  source: z.string(),
  url: z.string(),
  needs: z.array(z.string()),
});

const GUIDE = [
  'Connect the data sources of a NocoReach project for the person you work for, with their approval at each step. Add --json to any command to read its whole result.',
  '',
  '1. Run `nocoreach whoami`, then `nocoreach connect list --project <id>`. Each source has a state (connected, partial, ready…), `via` (cli: a command connects it; browser: the person does it on its page) and what it needs.',
  '2. Find what can be connected: `nocoreach connect discover --project <id> --url <website>`. Then read the website, its docs, its GitHub README and comparison pages yourself for what the rules miss: the main repository, package names, the community forum, competitors with their websites or repositories, and the name people search for.',
  '3. Before connecting anything, show the person a plan: what you will connect by command, what costs money (Google Trends about $0.022 a check and Reddit about $0.002 a search, both from the DataForSEO monthly budget), and what they must do in the browser. Connect only what they approve.',
  '4. For each approved source, run `nocoreach connect preview` and then `nocoreach connect add` with the same values. A project has one GitHub repository, one forum and one Hacker News search: adding another replaces the current one and its history, so ask first.',
  '   site --url <website> · github --url https://github.com/<org>/<repo> · discourse --url <forum> · packages --registry npm|pypi|docker --name <package> · mentions --terms "<name>, <domain>" (up to 5) · competitors --name <name> --site <url> and/or --repo <org/repo> · trends --name <product> · reddit --terms "<name>" (trends and reddit need DataForSEO connected first).',
  '   Website source (repo) is added on its page, one or more repositories, each serving some of the website’s addresses (a host, or a host and path such as example.com/docs): when the site’s pages live in several repositories, tell the person which repository serves which address.',
  '5. A `browser` source needs a sign-in, an authorization, a token or a Collector. Never ask for, read, store or type a password, token or API key. Give the person the source `url` and explain the steps on the third-party site (for example a read-only fine-grained GitHub token, a Discord bot or a Slack app); they enter the credential on that page themselves.',
  '6. Finish with `nocoreach connect list` and tell the person what is connected and what is left.',
].join('\n');

export const connectRoutes = defineApiRoutes<Application>((app) => {
  const routes = new Hono<Env>();
  const auth = app.container.resolve(authenticationToken);
  const keys = app.container.resolve(scopedApiKeysToken);
  const runtime = () => app.container.resolve(nocoReachToken);
  // The source's panel, as an address the person can open: the deployment's public origin, else the one asked.
  const page = (c: Context<Env>, source: string) =>
    `${(runtime().plugin as { publicOrigin?: string }).publicOrigin || new URL(c.req.url).origin}${app.publicBasePath}/connections?source=${encodeURIComponent(source)}`;
  const label = (key: string, locale?: string) =>
    systemMessageText(key, {}, locale);

  routes.use(
    '/nocoreachConnect/*',
    auth.required(),
    app.container.resolve(authorizationToken).middleware(),
    async (c, next) => {
      const host = runtime();
      await host.ready;
      const user = c.get('auth')!.user;
      if (
        !(await host.users.isRoot(String(user.id))) &&
        !(await roleOf(host.legacy.db, String(user.id)))
      )
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          domain: 'nocoreach',
          reason: 'CONNECT_MEMBER_REQUIRED',
          message: 'NocoReach membership is required.',
        });
      await next();
    },
  );

  /** Runs one NocoReach action as the signed-in person, with the checks the page's requests get. */
  async function run<T>(
    c: Context<Env>,
    resource: string,
    action: string,
    values: Record<string, unknown>,
  ): Promise<T> {
    const host = runtime();
    const fn = host.legacy.resources.action(resource, action);
    if (!fn) throw businessApiError(404, '没有这个操作');
    const session = c.get('auth')!;
    const user = session.user;
    const locale = getRequestLocale(c);
    const ctx = legacyContext({
      resource,
      action,
      method: 'POST',
      query: {},
      body: values,
      header: () => undefined,
      cookie: () => undefined,
      user: {
        id: String(user.id),
        name: user.name,
        email: user.email,
        kind: isServiceAccount(user) ? 'service' : 'person',
      },
      roles: (await host.users.isRoot(String(user.id))) ? ['root'] : [],
      app: host.legacy,
      cache: host.cache,
      logger: host.logger,
      locale,
    });
    const project = String(values.projectId);
    const keyScope = await keys.resolve(session, c.req.raw);
    try {
      await host.legacy.db.access!.run(
        {
          userId: String(user.id),
          http: c.req.raw,
          context: c.get('authz'),
          ...(keyScope ? { keyScope } : {}),
        },
        async () => {
          await host.legacy.db.access!.require(resource, action, project);
          await requireAccess(ctx);
          const invoke = () => fn(ctx, async () => {});
          if (host.plugin.mock?.enabled)
            await host.plugin.network.runProject(project, invoke);
          else await host.plugin.network.run(project, invoke);
        },
      );
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const status = (error as { status?: number }).status;
      if (
        error instanceof LegacyHttpError ||
        (typeof status === 'number' && status >= 400 && status < 600)
      )
        throw businessApiError(
          status as number,
          (error as Error).message,
          undefined,
          locale,
        );
      throw error;
    }
    return ctx.body as T;
  }

  // The same reads as the Data sources page, so a source's state here is the state on its card.
  async function status(
    c: Context<Env>,
    projectId: string,
  ): Promise<StatusInput> {
    const read = <T>(resource: string, action: string, extra = {}) =>
      run<T>(c, resource, action, { projectId, ...extra }).catch(() => null);
    const [
      list,
      google,
      site,
      keyword,
      github,
      community,
      repo,
      packages,
      hackernews,
      reddit,
      trends,
      competitors,
      x,
      chat,
      xiaohongshu,
      bilibili,
      youtube,
      articles,
    ] = await Promise.all([
      read<{ sources: StatusInput['publicSources'] }>('nrSources', 'list'),
      read<StatusInput['google']>('nrGoogle', 'status'),
      read<{ pages: number }>('nrSiteContent', 'summary'),
      read<StatusInput['keyword']>('nrKeywords', 'status'),
      read<StatusInput['github']>('nrGitHub', 'status'),
      read<StatusInput['community']>('nrCommunity', 'status'),
      read<{ repos?: { repo: string }[] }>('nrAgent', 'status'),
      read<StatusInput['packages']>('nrPackages', 'status'),
      read<StatusInput['hackernews']>('nrHackerNews', 'status'),
      read<StatusInput['reddit']>('nrReddit', 'status'),
      read<StatusInput['trends']>('nrTrends', 'status'),
      read<StatusInput['competitors']>('nrCompetitors', 'status'),
      read<StatusInput['x']>('nrX', 'status'),
      read<StatusInput['chat']>('nrChat', 'status'),
      read<StatusInput['xiaohongshu']>('nrXiaohongshu', 'status'),
      read<StatusInput['bilibili']>('nrBilibili', 'status'),
      read<StatusInput['youtube']>('nrYouTube', 'status'),
      read<{ targets: unknown[] }>('nrArticles', 'targets'),
    ]);
    return {
      publicSources: list?.sources ?? [],
      google,
      site,
      keyword,
      github,
      community,
      repos: repo?.repos ?? null,
      packages,
      hackernews,
      reddit,
      trends,
      competitors,
      x,
      chat,
      xiaohongshu,
      bilibili,
      youtube,
      articles: articles ? { targets: articles.targets.length } : null,
    };
  }

  function handOff(c: Context<Env>, id: string) {
    const source = connectSource(id)!;
    const locale = getRequestLocale(c);
    return {
      requiresBrowser: true as const,
      source: id,
      url: page(c, id),
      needs: source.needs.map((key) => label(key, locale)),
    };
  }
  function required<T>(value: T | undefined, flag: string): T {
    if (value === undefined)
      throw new ApiError({
        status: 'INVALID_ARGUMENT',
        domain: 'nocoreach',
        reason: 'CONNECT_VALUE_REQUIRED',
        message: `--${flag} is required for this source.`,
      });
    return value;
  }
  const termsOf = (input: Connect) =>
    required(input.terms, 'terms')
      .split(/[,，、]/)
      .map((term) => term.trim())
      .filter(Boolean);
  function cliSource(input: Connect) {
    const source = connectSource(input.source);
    if (!source)
      throw new ApiError({
        status: 'INVALID_ARGUMENT',
        domain: 'nocoreach',
        reason: 'CONNECT_UNKNOWN_SOURCE',
        message: `Unknown data source. Known: ${CONNECT_SOURCES.map((s) => s.id).join(', ')}.`,
      });
    return source.via === 'cli' ? source : null;
  }

  const declaration = (
    operationId: string,
    summary: string,
    description: string,
    schema: z.ZodType,
    cli: Parameters<typeof cliRoute>[0],
  ) =>
    describeRoute({
      tags: ['NocoReach Connect'],
      operationId,
      summary,
      description,
      responses: { 200: dataResponse(schema), ...apiErrorResponses },
      ...cliRoute(cli),
    });

  routes.get(
    '/nocoreachConnect/guide',
    declaration(
      'connectGuide',
      'How to connect a project’s data sources',
      'The steps an agent follows to connect data sources for a person: list, discover, plan, preview, add, and hand credentials to the browser. Run it with --json for the full text.',
      z.object({ guide: z.string() }),
      { command: 'connect guide', identities: ['person'] },
    ),
    (c) => c.json({ data: { guide: GUIDE } }),
  );

  routes.get(
    '/nocoreachConnect/sources',
    declaration(
      'listConnectSources',
      'List a project’s data sources',
      'Every data source of the Data sources page with its state, whether a command can connect it (via cli) or the person must on its page (via browser), what it needs, and that page.',
      z.array(SourceView),
      {
        command: 'connect list',
        identities: ['person'],
        flags: { projectId: { name: 'project' } },
        columns: ['id', 'name', 'state', 'via', 'requires'],
        examples: ['connect list --project 1'],
      },
    ),
    apiValidator('query', ProjectQuery),
    async (c) => {
      const { projectId } = c.req.valid('query');
      const input = await status(c, projectId);
      const locale = getRequestLocale(c);
      return c.json({
        data: CONNECT_SOURCES.map((source) => ({
          id: source.id,
          name: label(source.name, locale),
          state: connectionState(source.id, input),
          via: source.via,
          requires: source.requires ?? null,
          needs: source.needs.map((key) => label(key, locale)),
          url: page(c, source.id),
        })),
      });
    },
  );

  routes.post(
    '/nocoreachConnect/discover',
    declaration(
      'discoverConnectSources',
      'Find data sources on a website',
      'Reads the website’s homepage and lists the sources it links to (sites, GitHub repositories, forums, packages, chat and social accounts) with whether each is already connected. Nothing is connected.',
      z.unknown(),
      {
        command: 'connect discover',
        identities: ['person'],
        flags: { projectId: { name: 'project' } },
        examples: ['connect discover --project 1 --url https://example.com'],
      },
    ),
    apiValidator('json', DiscoverInput),
    async (c) => {
      const { projectId, url } = c.req.valid('json');
      return c.json({
        data: await run(c, 'nrDiscovery', 'discover', { projectId, url }),
      });
    },
  );

  /** What connecting a public source would record; Trends, Reddit and competitors have no preview, so it is the input. */
  async function preview(
    c: Context<Env>,
    id: string,
    input: Connect,
  ): Promise<unknown> {
    const { projectId } = input;
    switch (id) {
      case 'site':
        return run(c, 'nrSiteContent', 'discover', {
          projectId,
          url: required(input.url, 'url'),
        });
      case 'github':
        return run(c, 'nrGitHub', 'preview', {
          projectId,
          url: required(input.url, 'url'),
        });
      case 'discourse':
        return run(c, 'nrCommunity', 'preview', {
          projectId,
          url: required(input.url, 'url'),
        });
      case 'packages':
        return run(c, 'nrPackages', 'preview', {
          projectId,
          registry: required(input.registry, 'registry'),
          name: required(input.name, 'name'),
        });
      case 'mentions':
        return run(c, 'nrHackerNews', 'preview', {
          projectId,
          terms: termsOf(input),
        });
      default:
        return { source: id, values: describe(input) };
    }
  }

  /** Connects a public source with the same action and input as its panel. */
  async function add(
    c: Context<Env>,
    id: string,
    input: Connect,
  ): Promise<unknown> {
    const { projectId } = input;
    switch (id) {
      case 'site': {
        // The whole set of page types is kept, as discovery does; it can be narrowed on the panel later.
        const found = await run<{
          previewId: string;
          types: Record<string, number>;
        }>(c, 'nrSiteContent', 'discover', {
          projectId,
          url: required(input.url, 'url'),
        });
        await run(c, 'nrSiteContent', 'confirm', {
          projectId,
          previewId: found.previewId,
          types: Object.keys(found.types),
        });
        return run(c, 'nrSiteContent', 'summary', { projectId });
      }
      case 'github':
        return run(c, 'nrGitHub', 'connect', {
          projectId,
          url: required(input.url, 'url'),
        });
      case 'discourse':
        return run(c, 'nrCommunity', 'connect', {
          projectId,
          url: required(input.url, 'url'),
        });
      case 'packages':
        return run(c, 'nrPackages', 'add', {
          projectId,
          registry: required(input.registry, 'registry'),
          name: required(input.name, 'name'),
        });
      case 'mentions':
        return run(c, 'nrHackerNews', 'connect', {
          projectId,
          terms: termsOf(input),
        });
      case 'reddit':
        return run(c, 'nrReddit', 'connect', {
          projectId,
          terms: termsOf(input),
        });
      case 'trends':
        return run(c, 'nrTrends', 'connect', {
          projectId,
          product: required(input.name, 'name'),
          locationCode: 0,
        });
      default:
        return run(c, 'nrCompetitors', 'add', {
          projectId,
          name: required(input.name, 'name'),
          site: input.site ?? '',
          repo: input.repo ?? '',
        });
    }
  }

  routes.post(
    '/nocoreachConnect/preview',
    declaration(
      'previewConnectSource',
      'Preview connecting a data source',
      'Reads what connecting a public source would record, without saving anything. A source connected in the browser answers with its page and what it needs.',
      z.union([z.unknown(), BrowserHandOff]),
      {
        command: 'connect preview',
        identities: ['person'],
        flags: { projectId: { name: 'project' } },
        examples: [
          'connect preview --project 1 --source github --url https://github.com/org/repo',
        ],
      },
    ),
    apiValidator('json', ConnectInput),
    async (c) => {
      const input = c.req.valid('json');
      const source = cliSource(input);
      const data: unknown = source
        ? await preview(c, source.id, input)
        : handOff(c, input.source);
      return c.json({ data });
    },
  );

  routes.post(
    '/nocoreachConnect/add',
    declaration(
      'addConnectSource',
      'Connect a data source',
      'Connects a public source to the project as the signed-in person, as its panel would. A source connected in the browser (credentials, Google authorization, Collectors) is not connected here: the answer is its page and what it needs.',
      z.union([z.unknown(), BrowserHandOff]),
      {
        command: 'connect add',
        identities: ['person'],
        flags: { projectId: { name: 'project' } },
        confirm: 'Connect this data source to the project?',
        examples: [
          'connect add --project 1 --source github --url https://github.com/org/repo',
          'connect add --project 1 --source packages --registry npm --name example',
        ],
      },
    ),
    apiValidator('json', ConnectInput),
    async (c) => {
      const input = c.req.valid('json');
      const source = cliSource(input);
      const data: unknown = source
        ? await add(c, source.id, input)
        : handOff(c, input.source);
      return c.json({ data });
    },
  );

  return new Hono().route('/', routes);
});

function describe(input: Connect) {
  const { projectId: _project, source: _source, ...values } = input;
  return values;
}

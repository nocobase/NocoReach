import { collector } from './collectors.js';
import { community, discord, hackernews, slack, xApi } from './communities.js';
import { github } from './github.js';
import { google, googleCatalog } from './google.js';
import { WorldUnsupported } from './kit.js';
import { packages } from './packages.js';
import { dataforseo } from './seo.js';
import { website } from './website.js';
import { worldFor, type WorldProject } from './world.js';

export { WorldUnsupported } from './kit.js';
export { COLLECTOR_TOKEN, collectorUrl, followedVideos } from './collectors.js';
export type { WorldProject } from './world.js';

const POST = (u: URL): boolean =>
  /^collector\./.test(u.hostname) ||
  (u.hostname === 'api.github.com' && u.pathname === '/graphql') ||
  (u.hostname === 'api.dataforseo.com' && u.pathname.startsWith('/v3/')) ||
  (u.hostname === 'oauth2.googleapis.com' && u.pathname === '/token') ||
  (u.hostname === 'analyticsdata.googleapis.com' &&
    /:(?:runReport|batchRunReports|runRealtimeReport)$/.test(u.pathname)) ||
  (u.hostname === 'www.googleapis.com' &&
    u.pathname.endsWith('/searchAnalytics/query')) ||
  (u.hostname === 'searchconsole.googleapis.com' &&
    u.pathname === '/v1/urlInspection/index:inspect');

/**
 * Answers a demo project's outbound request from the demo world, as the real service would. Anything the world does
 * not cover throws `WorldUnsupported`; nothing is ever sent.
 */
export async function worldResponse(
  project: WorldProject,
  url: string | URL,
  init: RequestInit = {},
  now = Date.now(),
): Promise<Response> {
  const u = new URL(url);
  const method = (init.method || 'GET').toUpperCase();
  if (
    u.username ||
    u.password ||
    !['https:', 'http:'].includes(u.protocol) ||
    u.port
  )
    throw new WorldUnsupported('an unsafe or unsupported URL');
  if (!['GET', 'HEAD'].includes(method) && !(method === 'POST' && POST(u)))
    throw new WorldUnsupported(`${method} ${u.origin}${u.pathname}`);
  const world = worldFor(project, now);
  let response =
    collector(world, u, init) ??
    google(world, u, init) ??
    dataforseo(world, u, init) ??
    github(world, u, init) ??
    xApi(world, u) ??
    slack(world, u) ??
    discord(world, u) ??
    community(world, u) ??
    packages(world, u) ??
    hackernews(world, u) ??
    website(world, u);
  if (!response)
    throw new WorldUnsupported(`${method} ${u.origin}${u.pathname}`);
  if (method === 'HEAD')
    response = new Response(null, {
      status: response.status,
      headers: response.headers,
    });
  Object.defineProperty(response, 'url', { value: u.href });
  return response;
}

/** The fictional Google account, property and site a demo project connects to. */
export function worldGoogle(project: WorldProject, now = Date.now()) {
  return googleCatalog(worldFor(project, now));
}

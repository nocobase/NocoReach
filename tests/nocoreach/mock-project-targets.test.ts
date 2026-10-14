// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { MockEngine } from '../../app-plugins/nocoreach-mock/server/engine.js';
import {
  fixtureCatalog,
  fixtureResponse,
} from '../../app-plugins/nocoreach-mock/server/fixtures.js';
import type {
  MockFixtureProject,
  MockRunContext,
} from '../../app-plugins/nocoreach-mock/server/types.js';
import { ProxyProfiles } from '../../server/nocoreach/proxy-profiles.js';
import { OutboundNetwork } from '../../server/nocoreach/outbound-network.js';
import { SiteContent } from '../../server/nocoreach/site-content.js';

async function setup() {
  const values: Record<string, string> = {};
  const variables = {
    all: () => values,
    set: async (key: string, value: string) => {
      values[key] = value;
    },
  };
  const targets: Record<string, MockFixtureProject> = {
    '1': { name: 'Supabase', domain: 'supabase.com' },
    '2': { name: 'Other project', domain: 'other-project.example' },
  };
  const profiles = new ProxyProfiles(variables);
  const mock = new MockEngine({ enabled: true, environment: 'test' });
  const network = new OutboundNetwork(profiles, mock);
  const load = vi.fn(async (id: string) => ({ ...targets[id] }));
  await mock.attach({
    variables,
    app: { resourceManager: { define: () => {} }, acl: { allow: () => {} } },
    project: async () => ({}),
    requireAccess: async () => 'admin',
    assertPristine: async () => {},
    fixtureProject: load,
    projectSettings: (id, legacy) => profiles.mockStatus(id, legacy),
  });
  const profile = await profiles.save({
    kind: 'mock',
    name: 'shared demo',
    mock: { scenario: 'normal', seed: 'stable', clock: '2026-10-14T00:00:00Z' },
  });
  for (const id of Object.keys(targets))
    await profiles.selectAll(id, { profileId: profile.id });
  return { targets, profiles, profile, mock, network, load };
}

describe('project-aware raw fixtures', () => {
  it('isolates project targets while sharing the profile, and rejects unrelated hosts/endpoints', async () => {
    const { network, load } = await setup();
    const results = await Promise.all(
      ['1', '2'].map((id) =>
        network.runProject(id, async () => {
          const context = network.mockContext('google');
          const domain = context.project!.domain;
          const home = await network.fetch('site', `https://${domain}/`);
          expect(await home.text()).toContain(context.project!.name);
          const sitemap = await network.fetch(
            'site',
            `https://${domain}/sitemap-pages.xml`,
          );
          expect(sitemap.headers.get('content-type')).toContain(
            'application/xml',
          );
          expect(await sitemap.text()).toContain(`https://${domain}/`);
          const sites = await (
            await network.fetch(
              'google',
              'https://www.googleapis.com/webmasters/v3/sites',
            )
          ).json();
          expect(
            sites.siteEntry.map((site: { siteUrl: string }) => site.siteUrl),
          ).toEqual([`sc-domain:${domain}`, `https://${domain}/`]);
          await expect(
            network.fetch('site', 'https://unrelated.example/'),
          ).rejects.toMatchObject({ code: 'mock_unsupported_operation' });
          await expect(
            network.fetch('site', `https://${domain}/`, { method: 'DELETE' }),
          ).rejects.toMatchObject({ status: 501 });
          const repo = await (
            await network.fetch(
              'github',
              'https://api.github.com/repos/supabase/supabase',
            )
          ).json();
          expect(repo.full_name).toBe('supabase/supabase');
          expect(repo.stargazers_count).toBeGreaterThan(0);
          await expect(
            network.fetch(
              'github',
              'https://api.github.com/repos/supabase/supabase/unknown-api',
            ),
          ).rejects.toMatchObject({ status: 501 });
          return context;
        }),
      ),
    );
    expect(load).toHaveBeenCalledTimes(2);
    expect(results[0].project).not.toEqual(results[1].project);
    expect(results[0].profileId).toBe(results[1].profileId);
    await network.close();
  });
  it('captures immutable credential-free metadata and restores queued targets after edits and pause', async () => {
    const { targets, network, mock, profiles, load } = await setup();
    const saved = await network.runProject('1', async () => {
      const context = network.mockContext('google');
      expect(Object.isFrozen(context.project)).toBe(true);
      targets['1'] = { name: 'Changed project', domain: 'changed.example' };
      await network.runProject('1', async () => {
        expect(network.mockContext('google').project?.domain).toBe(
          'supabase.com',
        );
      });
      return JSON.parse(JSON.stringify(context)) as MockRunContext;
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(Object.keys(saved.project!)).toEqual(['name', 'domain']);
    const next = await network.runProject('1', () =>
      network.mockContext('google'),
    );
    expect(next.project?.domain).toBe('changed.example');
    await profiles.selectAll('1', { profileId: null });
    const before = load.mock.calls.length;
    const restored = await mock.runSnapshot(saved, () =>
      network.runProject('1', async () => {
        expect(Object.isFrozen(mock.capture('1').project)).toBe(true);
        return (
          await network.fetch(
            'google',
            'https://www.googleapis.com/webmasters/v3/sites',
          )
        ).json();
      }),
    );
    expect(restored.siteEntry[0].siteUrl).toBe('sc-domain:supabase.com');
    expect(load).toHaveBeenCalledTimes(before);
    await network.close();
  });
  it('keeps legacy queue snapshots on the original catalog rather than reading a new project', async () => {
    const { network, mock, load } = await setup();
    const { project: _ignored, ...legacy } = network.mockContext('google', '1');
    const catalog = await mock.runSnapshot(legacy, () =>
      network.runProject('1', () => fixtureCatalog(mock.capture('1'))),
    );
    expect(catalog.gscSiteUrl).toBe('sc-domain:nocobloom.example');
    expect(load).not.toHaveBeenCalled();
    await network.close();
  });
  it('escapes project text in HTML and validates restored project targets', async () => {
    const { targets, network, mock } = await setup();
    targets['1'] = {
      name: '<script>alert(1)</script>',
      domain: 'supabase.com',
    };
    const context = await network.runProject('1', () =>
      network.mockContext('site'),
    );
    const response = await fixtureResponse(
      'https://supabase.com/',
      {},
      context,
    );
    const html = await response.text();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(() =>
      mock.runSnapshot(
        { ...context, project: { name: 'bad', domain: '127.0.0.1' } },
        () => {},
      ),
    ).toThrow('NR_MOCK_INVALID_SNAPSHOT');
    expect(() =>
      mock.runSnapshot(
        {
          ...context,
          project: { name: 'bad', domain: 'supabase.com', token: 'secret' },
        },
        () => {},
      ),
    ).toThrow('NR_MOCK_INVALID_SNAPSHOT');
    await network.close();
  });
  it('reports unsupported simulated sitemap requests instead of misreporting a missing sitemap', async () => {
    const { network } = await setup();
    const site = new SiteContent({ network });
    await expect(
      network.runProject('1', () => site.discover('https://unrelated.example')),
    ).rejects.toMatchObject({
      status: 501,
      code: 'mock_unsupported_operation',
    });
    const result = await network.runProject('1', () =>
      site.discover('https://supabase.com'),
    );
    expect(result.pages).toHaveLength(8);
    expect(
      result.pages.every((page: { url: string }) =>
        page.url.startsWith('https://supabase.com/'),
      ),
    ).toBe(true);
    await network.close();
  });
});

it('retains explicit legacy Google resource queries without accepting unrelated sites', async () => {
  const { network } = await setup();
  await network.runProject('1', async () => {
    const query = (domain: string) =>
      network.fetch(
        'google',
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent('sc-domain:' + domain)}/searchAnalytics/query`,
        {
          method: 'POST',
          body: JSON.stringify({
            startDate: '2026-10-01',
            endDate: '2026-10-07',
            dimensions: ['page'],
          }),
        },
        '1',
      );
    const response = await (await query('nocobloom.example')).json();
    expect(response.rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(response.rows)).toContain('nocobloom.example');
    await expect(query('unrelated.example')).rejects.toMatchObject({
      status: 501,
    });
  });
});

it('rejects a restored snapshot reused across project boundaries before loading targets', async () => {
  const { network, mock, load } = await setup();
  const snapshot = await network.runProject('1', () =>
    network.withProfile('google', () => mock.capture('1')),
  );
  load.mockClear();
  await mock.runSnapshot(snapshot, async () => {
    await expect(
      network.runProject('2', () => 'wrong project'),
    ).rejects.toMatchObject({ code: 'NR_MOCK_SNAPSHOT_PROJECT_MISMATCH' });
  });
  expect(load).not.toHaveBeenCalled();
});

it('does not attach another active project target to an explicitly requested context', async () => {
  const { network } = await setup();
  await network.runProject('1', () => {
    expect(() => network.mockContext('google', '2')).toThrow(
      'NR_MOCK_SNAPSHOT_PROJECT_MISMATCH',
    );
  });
  await network.close();
});

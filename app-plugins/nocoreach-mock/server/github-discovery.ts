/** Synthetic public repositories for discovery; this adapter never performs I/O. */
export function githubDiscoveryFixture(url: URL): Response | undefined {
  if (url.hostname !== 'api.github.com') return undefined;
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  const names = [
    'demo-ecosystem/support-desk',
    'demo-ecosystem/inventory',
    'demo-ecosystem/framework-notes',
  ];
  const sha = 'a'.repeat(40);
  const meta = (name: string) => ({
    id: 880001 + names.indexOf(name),
    full_name: name,
    private: false,
    default_branch: 'main',
    description: name.split('/')[1],
    stargazers_count: 20 + names.indexOf(name) * 10,
    created_at: '2026-07-01T00:00:00Z',
    pushed_at: '2026-10-01T00:00:00Z',
    license: { spdx_id: 'Apache-2.0' },
    fork: false,
    archived: false,
    is_template: false,
  });
  if (
    url.pathname === '/search/code' ||
    (url.pathname === '/search/repositories' &&
      /nocobase/i.test(url.searchParams.get('q') || ''))
  ) {
    const code = url.pathname.endsWith('/code');
    const matching = /nocobase/i.test(url.searchParams.get('q') || '')
      ? names
      : [];
    return json({
      total_count: matching.length,
      incomplete_results: false,
      items:
        Number(url.searchParams.get('page') || 1) > 1
          ? []
          : matching.map((name) =>
              code
                ? { repository: meta(name), path: 'package.json' }
                : meta(name),
            ),
    });
  }
  const match = url.pathname.match(/^\/repos\/(demo-ecosystem\/[^/]+)(.*)$/);
  if (!match || !names.includes(match[1])) return undefined;
  const name = match[1],
    rest = decodeURIComponent(match[2]);
  if (!rest) return json(meta(name));
  if (rest === '/commits/main') return json({ sha });
  if (rest.startsWith('/contents/')) {
    const path = rest.slice('/contents/'.length);
    const files: Record<string, string> = {
      'package.json': JSON.stringify({
        nocobase: { templateKind: 'app' },
        dependencies: name.endsWith('framework-notes')
          ? {}
          : {
              '@nocobase/app-server': name.endsWith('inventory')
                ? '2.0.0'
                : '3.0.0-beta.3',
            },
      }),
      'server/runtime.ts':
        "import { defineAppRuntime } from '@nocobase/app-server/runtime';",
      'client/runtime.ts':
        "import { defineAppRuntime } from '@nocobase/app-client/runtime';",
    };
    if (!Object.hasOwn(files, path)) return json({ message: 'Not Found' }, 404);
    const content = files[path];
    return json({
      type: 'file',
      encoding: 'base64',
      size: Buffer.byteLength(content),
      content: Buffer.from(content).toString('base64'),
    });
  }
  return json({ message: 'Not Found' }, 404);
}

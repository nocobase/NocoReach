import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Plugin, ResolvedConfig } from 'vite';

// Application-owned menu entries only. Keep this mapping aligned with nocoreach-routes.ts;
// opaque plugin loaders and non-menu detail routes continue to load on demand.
export const routePrefetchPages = {
  'growth-overview': 'client/pages/strategy/index.tsx',
  'opportunity-library': 'client/pages/strategy/library.tsx',
  'action-center': 'client/pages/optimization-work.tsx',
  'result-list': 'client/pages/results/index.tsx',
  'content-index': 'client/pages/content-index.tsx',
  'website-performance': 'client/pages/data-website/index.tsx',
  'site-audit': 'client/pages/site-audit.tsx',
  'data-github': 'client/pages/data-github/index.tsx',
  'data-downloads': 'client/pages/data-downloads/index.tsx',
  'search-growth': 'client/pages/search-performance/index.tsx',
  'saved-keywords': 'client/pages/saved-keywords.tsx',
  'data-trends': 'client/pages/data-trends.tsx',
  'domain-overview': 'client/pages/competitors-page.tsx',
  'ai-search': 'client/pages/ai-search.tsx',
  'data-community': 'client/pages/data-community.tsx',
  'data-hackernews': 'client/pages/data-hackernews.tsx',
  'data-reddit': 'client/pages/data-reddit.tsx',
  'data-x': 'client/pages/data-x.tsx',
  'data-discord': 'client/pages/data-discord.tsx',
  'data-slack': 'client/pages/data-slack.tsx',
  'data-xiaohongshu': 'client/pages/data-xiaohongshu.tsx',
  'data-bilibili': 'client/pages/data-bilibili.tsx',
  'data-youtube': 'client/pages/data-youtube.tsx',
  agents: 'client/pages/agents/index.tsx',
  playbooks: 'client/pages/playbooks.tsx',
  skills: 'client/pages/skills.tsx',
  'project-settings': 'client/pages/project-knowledge.tsx',
  'analysis-rules': 'client/pages/analysis-rules.tsx',
  'data-connections': 'client/pages/source-connections.tsx',
  'proxy-profiles': 'client/pages/network.tsx',
  members: 'client/pages/members.tsx',
  roles: 'client/pages/access/roles.tsx',
  keys: 'client/pages/access/keys.tsx',
  schedules: 'client/pages/schedules/index.tsx',
};

/** Emit resource URLs from the actual bundle; never execute a route to discover its dependencies. */
export function routePrefetchPlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'nocoreach-route-prefetch',
    configResolved(value) {
      config = value;
    },
    generateBundle: {
      // Vite removes CSS-only JS chunks in generateBundle; inspect the final graph.
      order: 'post',
      handler(_options, bundle) {
        const resources: Record<string, string[]> = {};
        const chunks = Object.values(bundle).filter(
          (item) => item.type === 'chunk',
        );
        const findChunk = (source: string) =>
          chunks.find(
            (chunk) => path.resolve(config.root, source) in chunk.modules,
          );
        const gate = findChunk('client/pages/nocoreach-page.tsx');
        for (const [name, source] of Object.entries(routePrefetchPages)) {
          const entry = findChunk(source);
          if (!entry) continue;
          const files = new Set<string>();
          const visit = (file: string) => {
            if (files.has(file)) return;
            const chunk = bundle[file];
            if (!chunk || chunk.type !== 'chunk') return;
            files.add(file);
            for (const css of chunk.viteMetadata?.importedCss ?? [])
              files.add(css);
            chunk.imports.forEach(visit);
          };
          visit(entry.fileName);
          if (gate) visit(gate.fileName);
          resources[name] = [...files];
        }
        // URLs are relative to the emitted manifest, supporting nested mounts and CDN bases.
        const directory = 'assets';
        for (const name of Object.keys(resources)) {
          resources[name] = resources[name].map((file) =>
            path.posix.relative(directory, file),
          );
        }
        if (!Object.keys(resources).length) return;
        const source = JSON.stringify(resources);
        const digest = createHash('sha256')
          .update(source)
          .digest('hex')
          .slice(0, 16);
        const fileName = `assets/route-prefetch-${digest}.json`;
        this.emitFile({ type: 'asset', fileName, source });
        // Only HTML references the final manifest. Referencing it from JS would
        // create a hash cycle (manifest -> chunks -> manifest) or churn every
        // chunk on identical rebuilds. HTML already identifies the active build.
        for (const asset of Object.values(bundle)) {
          if (asset.type !== 'asset' || !asset.fileName.endsWith('.html'))
            continue;
          const url =
            config.base === './' || config.base === ''
              ? `./${path.posix.relative(path.posix.dirname(asset.fileName), fileName)}`
              : `${config.base}${fileName}`;
          const escapedUrl = url
            .replaceAll('&', '&amp;')
            .replaceAll('"', '&quot;');
          asset.source = String(asset.source).replace(
            '</head>',
            `<meta name="nocoreach-route-prefetch" content="${escapedUrl}"></head>`,
          );
        }
      },
    },
  };
}

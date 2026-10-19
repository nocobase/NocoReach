import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Plugin, ResolvedConfig } from 'vite';

const VIRTUAL_ID = 'virtual:nocoreach-route-prefetch';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
// Keep speculation bounded to high-traffic application pages. Plugin loaders are opaque.
const pages = {
  'growth-overview': 'client/pages/strategy/index.tsx',
  'opportunity-library': 'client/pages/strategy/library.tsx',
  'action-center': 'client/pages/optimization-work.tsx',
  'result-list': 'client/pages/results/index.tsx',
};

/** Emit resource URLs from the actual bundle; never execute a route to discover its dependencies. */
export function routePrefetchPlugin(): Plugin {
  let config: ResolvedConfig;
  let manifest: string;
  return {
    name: 'nocoreach-route-prefetch',
    configResolved(value) {
      config = value;
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },
    load(id) {
      if (id !== RESOLVED_ID) return;
      if (config.command !== 'build') return 'export default undefined;';
      manifest = this.emitFile({
        type: 'asset',
        // Allocate a build-specific URL before chunk hashing; the final graph
        // includes this URL, so hashing the manifest itself would be circular.
        fileName: `assets/route-prefetch-${randomUUID()}.json`,
      });
      return `export default import.meta.ROLLUP_FILE_URL_${manifest};`;
    },
    generateBundle: {
      // Vite removes CSS-only JS chunks in generateBundle; inspect the final graph.
      order: 'post',
      handler(_options, bundle) {
        if (!manifest) return;
        const resources: Record<string, string[]> = {};
        const chunks = Object.values(bundle).filter(
          (item) => item.type === 'chunk',
        );
        const findChunk = (source: string) =>
          chunks.find(
            (chunk) => path.resolve(config.root, source) in chunk.modules,
          );
        const gate = findChunk('client/pages/nocoreach-page.tsx');
        for (const [name, source] of Object.entries(pages)) {
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
        const directory = path.posix.dirname(this.getFileName(manifest));
        for (const name of Object.keys(resources)) {
          resources[name] = resources[name].map((file) =>
            path.posix.relative(directory, file),
          );
        }
        this.setAssetSource(manifest, JSON.stringify(resources));
      },
    },
  };
}

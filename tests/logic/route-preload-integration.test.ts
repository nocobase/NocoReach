// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { expect, it } from 'vitest';
import { routePrefetchPlugin } from '../../scripts/route-prefetch.js';

it.each(['./', 'https://cdn.example.com/release/'])(
  'emits actual JS and CSS resource URLs for base %s without importing pages',
  async (base) => {
    const root = await mkdtemp(path.join(tmpdir(), 'nr-route-prefetch-'));
    try {
      await mkdir(path.join(root, 'client/pages/strategy'), {
        recursive: true,
      });
      await writeFile(
        path.join(root, 'client/pages/strategy/index.tsx'),
        "import './shared.js'; globalThis.pageExecuted = true; export default 1;",
      );
      await writeFile(
        path.join(root, 'client/pages/strategy/style.css'),
        '.page {color: red}',
      );
      await writeFile(
        path.join(root, 'client/pages/strategy/shared.js'),
        "import './style.css';",
      );
      await writeFile(
        path.join(root, 'client/pages/strategy/library.tsx'),
        "import './shared.js'; export default 2;",
      );
      await writeFile(
        path.join(root, 'entry.js'),
        `import url from 'virtual:nocoreach-route-prefetch'; globalThis.manifest = url; globalThis.openPage = () => import('./client/pages/strategy/index.tsx'); globalThis.openOther = () => import('./client/pages/strategy/library.tsx');`,
      );
      const result = await build({
        root,
        configFile: false,
        base,
        cacheDir: path.join(root, '.cache'),
        plugins: [routePrefetchPlugin()],
        logLevel: 'silent',
        build: {
          write: false,
          rollupOptions: { input: path.join(root, 'entry.js') },
        },
      });
      if (Array.isArray(result) || !('output' in result))
        throw new Error('Unexpected output');
      const manifest = result.output.find(
        (item) => item.fileName === 'assets/route-prefetch.json',
      );
      if (!manifest || manifest.type !== 'asset')
        throw new Error('Missing manifest');
      const resources = JSON.parse(String(manifest.source));
      expect(Object.keys(resources)).toEqual([
        'growth-overview',
        'opportunity-library',
      ]);
      expect(
        resources['growth-overview'].some((file: string) =>
          file.endsWith('.css'),
        ),
      ).toBe(true);
      expect(
        resources['growth-overview'].some((file: string) =>
          file.endsWith('.js'),
        ),
      ).toBe(true);
      for (const file of resources['growth-overview']) {
        expect(
          result.output.some(
            (item) => item.fileName === path.posix.join('assets', file),
          ),
        ).toBe(true);
      }
      const entry = result.output.find(
        (item) => item.type === 'chunk' && item.isEntry,
      );
      expect(entry && entry.type === 'chunk' && entry.code).not.toContain(
        'pageExecuted',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

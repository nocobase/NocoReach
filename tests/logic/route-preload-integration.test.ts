// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { injectSpaRuntimeHtml } from '@nocobase/app-server/spa';
import { expect, it } from 'vitest';
import { routePrefetchPlugin } from '../../scripts/route-prefetch.js';

it.each(['./', '/nested/', 'https://cdn.example.com/release/'])(
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
        `globalThis.openPage = () => import('./client/pages/strategy/index.tsx'); globalThis.openOther = () => import('./client/pages/strategy/library.tsx');`,
      );
      await writeFile(
        path.join(root, 'index.html'),
        '<html><head></head><body><script type="module" src="./entry.js"></script></body></html>',
      );
      const compile = () =>
        build({
          root,
          configFile: false,
          base,
          cacheDir: path.join(root, '.cache'),
          plugins: [routePrefetchPlugin()],
          logLevel: 'silent',
          build: {
            write: false,
            rollupOptions: { input: path.join(root, 'index.html') },
          },
        });
      const result = await compile();
      if (Array.isArray(result) || !('output' in result))
        throw new Error('Unexpected output');
      const manifest = result.output.find((item) =>
        /^assets\/route-prefetch-[\w-]+\.json$/.test(item.fileName),
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
      const html = result.output.find(
        (item) => item.type === 'asset' && item.fileName === 'index.html',
      );
      if (!html || html.type !== 'asset') throw new Error('Missing HTML');
      const url = /name="nocoreach-route-prefetch" content="([^"]+)"/.exec(
        String(html.source),
      )?.[1];
      expect(url).toBe(`${base}${manifest.fileName}`);
      // The production SPA renderer rewrites relative meta URLs for deep routes.
      const servedHtml = injectSpaRuntimeHtml(String(html.source), {
        publicBasePath: '/nested',
      });
      const servedUrl =
        /name="nocoreach-route-prefetch" content="([^"]+)"/.exec(
          servedHtml,
        )?.[1];
      expect(
        new URL(servedUrl!, 'https://app.example.com/nested/actions/123')
          .pathname,
      ).toBe(
        `${base.startsWith('https:') ? '/release/' : '/nested/'}${manifest.fileName}`,
      );
      const manifestLocation = new URL(url!, 'https://app.example.com/nested/');
      expect(manifestLocation.pathname).toBe(
        `${base.startsWith('https:') ? '/release/' : '/nested/'}${manifest.fileName}`,
      );
      const entry = result.output.find(
        (item) => item.type === 'chunk' && item.isEntry,
      );
      expect(entry && entry.type === 'chunk' && entry.code).not.toContain(
        'pageExecuted',
      );
      expect(entry && entry.type === 'chunk' && entry.code).not.toContain(
        manifest.fileName,
      );
      // Identical builds retain every resource URL, not just the manifest URL.
      const again = await compile();
      if (Array.isArray(again) || !('output' in again))
        throw new Error('Unexpected output');
      expect(again.output).toEqual(result.output);
      // A changed page gets a new manifest while the old document retains its own URL.
      await writeFile(
        path.join(root, 'client/pages/strategy/index.tsx'),
        "import './shared.js'; globalThis.pageExecuted = 'changed'; export default 3;",
      );
      const changed = await compile();
      if (Array.isArray(changed) || !('output' in changed))
        throw new Error('Unexpected output');
      expect(
        changed.output.some((item) => item.fileName === manifest.fileName),
      ).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

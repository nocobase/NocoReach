// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { expect, it } from 'vitest';
import { startupMessagesPlugin } from '../../scripts/startup-messages.js';

const appRoot = fileURLToPath(new URL('../../', import.meta.url));
const dictionary = path.join(appRoot, 'shared/i18n/en.json');

async function compile(source: string) {
  const root = await mkdtemp(path.join(tmpdir(), 'nr-startup-build-'));
  try {
    await writeFile(path.join(root, 'entry.ts'), source);
    return await build({
      root,
      configFile: false,
      logLevel: 'silent',
      cacheDir: path.join(root, '.cache'),
      plugins: [startupMessagesPlugin({ appRoot })],
      build: {
        write: false,
        rollupOptions: { input: path.join(root, 'entry.ts') },
      },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

it('builds shell copy separately and keeps the business catalog behind a dynamic import', async () => {
  const result = await compile(`
    import { english } from 'virtual:nocoreach-startup-messages';
    globalThis.shellTitle = english['common.currentProject'];
    globalThis.openPage = () => import('virtual:nocoreach-business-messages/workspace');
  `);
  if (Array.isArray(result) || !('output' in result))
    throw new Error('Unexpected build result');
  const entry = result.output.find(
    (item) => item.type === 'chunk' && item.isEntry,
  );
  expect(entry?.type).toBe('chunk');
  if (entry?.type !== 'chunk') throw new Error('Missing entry');
  expect(entry.dynamicImports).toHaveLength(1);
  expect(entry.code).not.toContain('strategy.insights');
});

it('rejects a static startup import of the full business dictionary', async () => {
  await expect(
    compile(
      `import english from ${JSON.stringify(dictionary)}; globalThis.copy = english;`,
    ),
  ).rejects.toThrow('Startup imports a deferred business resource');
});

it('rejects statically importing a generated business catalog into the startup entry', async () => {
  await expect(
    compile(
      `import copy from 'virtual:nocoreach-business-messages/workspace'; globalThis.copy = copy;`,
    ),
  ).rejects.toThrow('Startup imports a deferred business resource');
});

it('rejects a full dictionary hidden behind a lazy business page', async () => {
  await expect(
    compile(
      `globalThis.openPage = () => import(${JSON.stringify(dictionary)});`,
    ),
  ).rejects.toThrow('Browser imports a complete business dictionary');
});

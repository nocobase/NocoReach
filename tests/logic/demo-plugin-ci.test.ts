// @vitest-environment node
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { pack, prepare } from '../../scripts/ci/prepare-demo-plugin.mjs';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'demo-ci-test-'));
  roots.push(root);
  const write = (name: string, content: string) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content);
  };
  write(
    'package.json',
    JSON.stringify({
      dependencies: {
        '@nocobase/app-plugin-demo-mode': '0.0.1',
        hono: '4.0.0',
      },
      devDependencies: {},
      files: ['server'],
    }),
  );
  write('cli/plugins.ts', 'export const hooks = { afterServerBuild: [\n] };');
  const lock =
    "lockfileVersion: '9.0'\nimporters:\n\n  .:\n    dependencies:\n      hono:\n        specifier: 4.0.0\n        version: 4.0.0\n\npackages:\n  hono@4.0.0: {}\n";
  write('pnpm-lock.yaml', lock);
  write(
    'source/package.json',
    JSON.stringify({
      name: '@nocobase/app-plugin-demo-mode',
      version: '0.0.1',
      type: 'module',
      dependencies: { hono: 'catalog:' },
      publishConfig: { exports: { './server': './dist/server/index.js' } },
    }),
  );
  write('source/dist/server/index.js', 'export const plugin = true;');
  write('source/dist/database/migrations/.manifest.json', '{}');
  write('source/skills/demo/SKILL.md', '# Demo');
  write('source/README.md', '# Demo');
  pack(path.join(root, 'source'), path.join(root, 'app-plugins/demo-mode'));
  return { root, lock, write };
}

it('keeps the compiled plugin and migration manifest, preserving every registry lock entry', () => {
  const { root, lock } = fixture();
  prepare(root);
  const result = readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8');
  expect(
    result
      .replace(
        "      '@nocobase/app-plugin-demo-mode':\n        specifier: workspace:*\n        version: link:app-plugins/demo-mode\n",
        '',
      )
      .replace('\n  app-plugins/demo-mode: {}\n', ''),
  ).toBe(lock);
  expect(
    readFileSync(
      path.join(
        root,
        'app-plugins/demo-mode/dist/database/migrations/.manifest.json',
      ),
      'utf8',
    ),
  ).toBe('{}');
  expect(readFileSync(path.join(root, 'cli/plugins.ts'), 'utf8')).toContain(
    'scripts/ci/include-demo-plugin.mjs',
  );
});

it('rejects a fixture whose runtime dependency the application does not supply', () => {
  const { root, write } = fixture();
  write('app-plugins/demo-mode/host-dependencies.json', '["missing-runtime"]');
  expect(() => prepare(root)).toThrow('The host must supply missing-runtime');
});

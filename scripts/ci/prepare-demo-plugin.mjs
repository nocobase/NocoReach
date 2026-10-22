// Temporary integration bridge until the Demo Mode package is published to npm.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const name = '@nocobase/app-plugin-demo-mode';
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value) =>
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

export function pack(source, destination) {
  const manifest = readJson(path.join(source, 'package.json'));
  assert.equal(manifest.name, name);
  assert.ok(manifest.publishConfig?.exports);
  mkdirSync(destination, { recursive: true });
  for (const entry of ['dist', 'skills', 'README.md'])
    cpSync(path.join(source, entry), path.join(destination, entry), {
      recursive: true,
    });
  // Resolve against the application's own runtime, rather than loading a second
  // copy of identity-sensitive peers from the source monorepo.
  writeJson(path.join(destination, 'package.json'), {
    name,
    version: manifest.version,
    type: manifest.type,
    exports: manifest.publishConfig.exports,
    imports: manifest.publishConfig.imports,
    files: ['dist', 'skills'],
    scripts: { build: 'node -e "process.exit(0)"' },
  });
  writeJson(path.join(destination, 'host-dependencies.json'), [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
}

export function prepare(root) {
  const packagePath = path.join(root, 'package.json');
  const manifest = readJson(packagePath);
  const fixture = path.join(root, 'app-plugins/demo-mode');
  assert.equal(manifest.dependencies[name], '0.0.1');
  for (const dependency of readJson(
    path.join(fixture, 'host-dependencies.json'),
  ))
    assert.ok(
      manifest.dependencies[dependency] || manifest.devDependencies[dependency],
      `The host must supply ${dependency}`,
    );
  manifest.dependencies[name] = 'workspace:*';
  manifest.files.push('app-plugins/demo-mode');

  // Add only the local workspace edge. Every registry dependency remains frozen
  // at its reviewed lockfile resolution; do not run a fresh dependency solve.
  const lockPath = path.join(root, 'pnpm-lock.yaml');
  let lock = readFileSync(lockPath, 'utf8');
  assert.ok(!lock.includes(name));
  assert.ok(lock.includes('  .:\n    dependencies:\n'));
  lock = lock.replace(
    '  .:\n    dependencies:\n',
    `  .:\n    dependencies:\n      '${name}':\n        specifier: workspace:*\n        version: link:app-plugins/demo-mode\n`,
  );
  assert.ok(lock.includes('\npackages:\n'));
  lock = lock.replace(
    '\npackages:\n',
    '\n  app-plugins/demo-mode: {}\n\npackages:\n',
  );
  const cliPath = path.join(root, 'cli/plugins.ts');
  const cli = readFileSync(cliPath, 'utf8');
  assert.ok(cli.includes('afterServerBuild: [\n'));
  writeFileSync(
    cliPath,
    cli.replace(
      'afterServerBuild: [\n',
      "afterServerBuild: [\n        { label: 'Include Demo Mode fixture', command: ['node', 'scripts/ci/include-demo-plugin.mjs'] },\n",
    ),
  );
  writeJson(packagePath, manifest);
  writeFileSync(lockPath, lock);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv[2] === 'pack') pack(process.argv[3], process.argv[4]);
  else if (process.argv[2] === 'prepare')
    prepare(path.resolve(process.argv[3] ?? '.'));
  else throw new Error('Expected pack <source> <destination> or prepare <app>');
}

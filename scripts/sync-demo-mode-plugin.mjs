#!/usr/bin/env node
// Copies the built @nocobase/app-plugin-demo-mode from a NocoBase checkout into app-plugins/demo-mode until the
// package is published. Build it there first (`pnpm --filter @nocobase/app-plugin-demo-mode build`), then run:
//   node scripts/sync-demo-mode-plugin.mjs ~/work/nocobase
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const checkout = process.argv[2];
if (!checkout) {
  console.error(
    'Usage: node scripts/sync-demo-mode-plugin.mjs <nocobase checkout>',
  );
  process.exit(1);
}
const source = path.resolve(checkout, 'packages/plugins/app-plugin-demo-mode');
const target = path.resolve(import.meta.dirname, '../app-plugins/demo-mode');
if (!existsSync(path.join(source, 'dist/server/index.js'))) {
  console.error(`${source} has no build; run its build first.`);
  process.exit(1);
}
const manifest = JSON.parse(
  readFileSync(path.join(source, 'package.json'), 'utf8'),
);
rmSync(path.join(target, 'dist'), { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(path.join(source, 'dist'), path.join(target, 'dist'), {
  recursive: true,
});
cpSync(path.join(source, 'README.md'), path.join(target, 'README.md'));
// Skills are part of the package contract, so local integration must deliver them too.
rmSync(path.join(target, 'skills'), { recursive: true, force: true });
cpSync(path.join(source, 'skills'), path.join(target, 'skills'), {
  recursive: true,
});
// The published shape: compiled exports and imports, no sources, scripts or development dependencies.
const published = {
  name: manifest.name,
  version: manifest.version,
  description: manifest.description,
  type: manifest.type,
  exports: manifest.publishConfig.exports,
  imports: manifest.publishConfig.imports,
  files: ['dist', 'skills'],
  engines: manifest.engines,
};
writeFileSync(
  path.join(target, 'package.json'),
  `${JSON.stringify(published, null, 2)}\n`,
);
console.log(
  `Synced ${manifest.name}@${manifest.version} into ${path.relative(process.cwd(), target)}`,
);

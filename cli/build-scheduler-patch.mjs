// NocoBase's build installs production packages from the registry again. Carry
// this repository's pinned Scheduler extension into the self-contained artifact.
import { copyFileSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const packageName = '@nocobase/app-plugin-scheduler';
const source = realpathSync(path.join(root, 'node_modules', packageName));
const destination = path.join(root, 'dist/node_modules', packageName);
const readPackage = (directory) =>
  JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
const version = '1.0.0-beta.17';
if (
  readPackage(source).version !== version ||
  readPackage(destination).version !== version
) {
  throw new Error(
    'The NocoReach Scheduler patch must be reviewed for the installed version.',
  );
}
const service = readFileSync(
  path.join(source, 'dist/server/services/scheduler.js'),
  'utf8',
);
if (
  !service.includes('registerTimingResolver(') ||
  !service.includes('triggerSchedule(')
) {
  throw new Error('Install the NocoReach Scheduler patch before building.');
}
for (const file of [
  'dist/server/services/scheduler.js',
  'dist/server/services/scheduler.d.ts',
  'dist/server/store.js',
  'dist/server/store.d.ts',
  'dist/server/tokens.d.ts',
]) {
  copyFileSync(path.join(source, file), path.join(destination, file));
}

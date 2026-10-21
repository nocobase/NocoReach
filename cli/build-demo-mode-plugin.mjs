// Preserve the local plugin's compiled exports and migrations in standalone deployment packages.
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'app-plugins/demo-mode');
const target = path.join(root, 'dist/app-plugins/demo-mode');
await mkdir(target, { recursive: true });
for (const name of ['package.json', 'README.md', 'dist', 'skills'])
  await cp(path.join(source, name), path.join(target, name), {
    recursive: true,
  });

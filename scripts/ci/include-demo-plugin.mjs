import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const target = path.join(root, 'dist/app-plugins/demo-mode');
mkdirSync(target, { recursive: true });
for (const entry of ['package.json', 'README.md', 'dist', 'skills'])
  cpSync(
    path.join(root, 'app-plugins/demo-mode', entry),
    path.join(target, entry),
    {
      recursive: true,
    },
  );

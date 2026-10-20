import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const appRoot = path.resolve(import.meta.dirname, '../..');

/** Exercise the real application config, including its local plugin imports. */
export async function copyAppViteFixture(root: string) {
  for (const file of [
    'vite.config.ts',
    'package.json',
    'scripts/route-prefetch.ts',
    'scripts/startup-messages.ts',
    'scripts/business-messages.ts',
    'shared/startup-pages.ts',
  ]) {
    const target = path.join(root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(appRoot, file), target);
  }
}

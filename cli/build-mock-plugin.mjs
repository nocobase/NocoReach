// Carry the local app plugin's metadata and public package layout into the standalone deployment.
// TypeScript emits the host's relative imports separately; package metadata is still required by plugin discovery.
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'app-plugins/nocoreach-mock');
const destination = path.join(root, 'dist/app-plugins/nocoreach-mock');
await mkdir(destination, { recursive: true });
for (const name of ['package.json', 'README.md', 'dist']) {
  await cp(path.join(source, name), path.join(destination, name), {
    recursive: true,
  });
}

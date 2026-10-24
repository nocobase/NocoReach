// Production dependency installation uses the registry package. Preserve the
// pinned pre-release migration history from the reviewed dependency patch.
import { copyFileSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const packageName = '@nocobase/app-plugin-demo-mode';
const source = realpathSync(path.join(root, 'node_modules', packageName));
const destination = path.join(root, 'dist/node_modules', packageName);
for (const directory of [source, destination]) {
  const manifest = JSON.parse(
    readFileSync(path.join(directory, 'package.json'), 'utf8'),
  );
  if (manifest.version !== '0.1.0-beta.0') {
    throw new Error(
      'Review the Demo Mode migration compatibility patch before upgrading.',
    );
  }
}
const directory = 'dist/database/migrations';
const manifestPath = path.join(directory, '.manifest.json');
const manifest = JSON.parse(
  readFileSync(path.join(source, manifestPath), 'utf8'),
);
if (
  Object.keys(manifest.files).length !== 8 ||
  !manifest.files['202610230001_demo_mode_account_credentials.js']
) {
  throw new Error(
    'Install the Demo Mode migration compatibility patch before building.',
  );
}
for (const [file, entry] of Object.entries(manifest.files)) {
  const bytes = readFileSync(path.join(source, directory, file));
  if (
    createHash('sha256').update(bytes).digest('hex') !== entry.artifactChecksum
  ) {
    throw new Error(`Demo Mode migration artifact checksum mismatch: ${file}`);
  }
}
for (const file of [...Object.keys(manifest.files), '.manifest.json']) {
  copyFileSync(
    path.join(source, directory, file),
    path.join(destination, directory, file),
  );
}

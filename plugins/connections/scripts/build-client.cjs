'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'client/index.js'), 'utf8');
for (const lane of ['client', 'client-v2']) {
  const directory = path.join(root, 'dist', lane);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.js'), source);
}

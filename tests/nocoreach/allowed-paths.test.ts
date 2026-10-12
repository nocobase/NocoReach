import { expect, it } from 'vitest';

import { allowedPath } from '../../server/nocoreach/execution/agent.js';

it.each([
  { paths: [], file: 'content/articles/example/index.md', allowed: true },
  { paths: [], file: 'package.json', allowed: true },
  { paths: ['docs'], file: 'docs/a.md', allowed: true },
  { paths: ['docs'], file: 'docs-other/a.md', allowed: false },
  { paths: ['docs/a.md'], file: 'docs/a.md', allowed: true },
  { paths: ['docs/a.md'], file: 'docs/b.md', allowed: false },
])('validates $file with allowedPaths=$paths', ({ paths, file, allowed }) => {
  expect(allowedPath({ allowedPaths: paths }, file)).toBe(allowed);
});

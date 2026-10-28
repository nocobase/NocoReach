import { expect, test } from 'vitest';
import {
  bodyEdits,
  primaryChanges,
} from '../../server/nocoreach/articles/edits.js';

// What an approved primary changed, given to the run that updates the article's other languages in place (2026-10-28).

const before = [
  '# Best ERP solutions',
  'Intro that goes away.',
  '## Why ERP',
  'Small teams lose hours.',
  '## NocoBase',
  'An open-source no-code platform.',
  '## Conclusion',
  'Pick what fits.',
].join('\n\n');

test('body edits list each changed stretch with the unchanged block before it', () => {
  const after = [
    '# Best ERP solutions',
    '## Why ERP',
    'Small teams lose hours.',
    '## Quick comparison',
    '| Tool | Cost |\n| --- | --- |\n| Odoo | Per user |',
    '## NocoBase',
    'NocoBase 3 keeps the core apart from the business part.',
    '## Conclusion',
    'Pick what fits.',
  ].join('\n\n');
  expect(bodyEdits(before, after)).toEqual([
    {
      near: '# Best ERP solutions',
      before: 'Intro that goes away.',
      after: '',
    },
    {
      near: 'Small teams lose hours.',
      before: '',
      after:
        '## Quick comparison\n\n| Tool | Cost |\n| --- | --- |\n| Odoo | Per user |',
    },
    {
      near: '## NocoBase',
      before: 'An open-source no-code platform.',
      after: 'NocoBase 3 keeps the core apart from the business part.',
    },
  ]);
  // A change at the very start has nothing before it; Windows line ends and extra blank lines do not count.
  expect(bodyEdits('One\n\nTwo', 'Zero\r\n\r\n\r\nOne\r\n\r\nTwo')).toEqual([
    { near: '', before: '', after: 'Zero' },
  ]);
  expect(bodyEdits(before, before)).toEqual([]);
});

test('primary changes name only the fields the primary changed', () => {
  const was = { title: 'Old', description: 'Same', body: before };
  // Only the title: no body edits are asked for.
  expect(primaryChanges(was, { ...was, title: 'New' }, ['title'])).toEqual([
    { field: 'title', before: 'Old', after: 'New' },
  ]);
  expect(
    primaryChanges(
      was,
      { ...was, description: 'Other', body: `${before}\n\nMore.` },
      ['description', 'body'],
    ),
  ).toEqual([
    { field: 'description', before: 'Same', after: 'Other' },
    {
      field: 'body',
      edits: [{ near: 'Pick what fits.', before: '', after: 'More.' }],
    },
  ]);
  // A rewrite too large to list is left for the Agent to compare.
  const long = Array.from(
    { length: 400 },
    (_, i) => `Paragraph ${i} ${'x'.repeat(200)}`,
  ).join('\n\n');
  expect(primaryChanges(was, { ...was, body: long }, ['body'])).toEqual([
    { field: 'body', edits: [], truncated: true },
  ]);
});

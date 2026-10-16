// Regenerates server/nocoreach/skills-bundled.json, the marketing Skills every new library starts with, from a local
// checkout of https://github.com/coreyhaines31/marketingskills (MIT). Pin a release by checking out its commit first:
//
//   git clone https://github.com/coreyhaines31/marketingskills /tmp/marketingskills
//   git -C /tmp/marketingskills checkout <commit>
//   node scripts/sync-marketing-skills.mjs /tmp/marketingskills
//
// Only text files are kept; the upstream evals are left out. Each Skill must fit the library's limits (skills.ts).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// Chosen for NocoReach's work (SEO and AI search, content, competitors and users, conversion and data); see CHANGELOG.
const NAMES = [
  'seo-audit',
  'ai-seo',
  'schema',
  'site-architecture',
  'programmatic-seo',
  'content-strategy',
  'copywriting',
  'copy-editing',
  'launch',
  'competitor-profiling',
  'competitors',
  'customer-research',
  'community-marketing',
  'cro',
  'analytics',
];
const OUT = new URL('../server/nocoreach/skills-bundled.json', import.meta.url);
const SOURCE = 'https://github.com/coreyhaines31/marketingskills';
const TEXT = /\.(md|txt|json|csv|ya?ml)$/i;

const root = process.argv[2];
assert.ok(
  root,
  'Usage: node scripts/sync-marketing-skills.mjs <marketingskills checkout>',
);
const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
const frontmatter = (text) => {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(m, 'SKILL.md has no frontmatter');
  const field = (key) => {
    const v = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(m[1])?.[1].trim() ?? '';
    return /^(['"]).*\1$/.test(v) ? v.slice(1, -1) : v;
  };
  return {
    name: field('name'),
    description: field('description'),
    body: text.slice(m[0].length).trim(),
  };
};

const skills = NAMES.map((name) => {
  const dir = join(root, 'skills', name);
  const md = frontmatter(
    readFileSync(join(dir, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n'),
  );
  assert.equal(md.name, name);
  const attached = files(dir)
    .map((path) => relative(dir, path).split('\\').join('/'))
    .filter(
      (path) =>
        path !== 'SKILL.md' && !path.startsWith('evals/') && TEXT.test(path),
    )
    .sort()
    .map((path) => ({
      path,
      text: readFileSync(join(dir, path), 'utf8').replace(/\r\n/g, '\n'),
    }));
  // The library's limits; LICENSE.md is added to every Skill when it is installed.
  assert.ok(
    md.description.length > 0 && md.description.length <= 1024,
    `${name}: description`,
  );
  assert.ok(md.body.length <= 50000, `${name}: body`);
  assert.ok(attached.length + 1 <= 20, `${name}: files`);
  assert.ok(
    attached.every((f) => f.text.length <= 200000),
    `${name}: file size`,
  );
  const size = md.body.length + attached.reduce((n, f) => n + f.text.length, 0);
  assert.ok(size <= 480000, `${name}: size`);
  return { name, description: md.description, body: md.body, files: attached };
});

const license = readFileSync(join(root, 'LICENSE'), 'utf8')
  .replace(/\r\n/g, '\n')
  .trim();
writeFileSync(
  OUT,
  `${JSON.stringify({ source: SOURCE, commit, license, skills }, null, 2)}\n`,
);
console.log(`Wrote ${skills.length} Skills from ${SOURCE} at ${commit}`);

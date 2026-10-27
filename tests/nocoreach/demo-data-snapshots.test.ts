// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { PROJECT_SNAPSHOTS } from '../../server/nocoreach/demo-data/clear';

// Global snapshots, or snapshots addressed by a skill/run ID rather than a project ID.
const SHARED_SNAPSHOTS = new Set([
  'nr-skill',
  'nr-task-materials',
  'nr-migrations',
  'mock-demo',
]);
// A conservative scan also encounters these non-snapshot prefixes. Keep them explicit so a new storage namespace
// cannot silently be excluded. Signals and command IDs live inside their owning project's snapshot.
const NON_SNAPSHOT_PREFIXES = new Set([
  'demo', // Simulated runtime run ID; the persisted row remains nr-task-run.
  'ai-answer',
  'ai-share',
  'ai-uncited',
  'community-category',
  'community-covered',
  'community-gap',
  'competitor-pages',
  'competitor-release',
  'ga4-low-conversion',
  'github-referrer',
  'github-release',
  'github-rival-stars',
  'github-topic',
  'gsc-click-drop',
  'gsc-low-ctr',
  'gsc-near-first',
  'hn-story',
  'packages-downloads',
  'rank-drop',
  'rank-lost',
  'rank-top10',
  'site-stale',
  'site-thin',
  'trends-kw-move',
  'trends-kw-rising',
  'x-hot',
  'connect',
  'content',
  'created',
  'draft',
  'field',
  'ga4',
  'growth-google',
  'gsc',
  'handoff',
  'id',
  'keyword',
  'locale',
  'lock',
  'manual',
  'metadata',
  'missing',
  'mock-google-run',
  'nocobase-editorial-v1',
  'nocoreach',
  'pick',
  'repo',
  'saved',
  'topic',
  'upload',
  'docs',
  'http',
  'https',
  'data',
  'node',
  'file',
  'mailto',
  'sc-domain',
  'site',
  'socks5',
  'socks5h',
  'ytsearch5',
]);

it('classifies every literal snapshot prefix and the task/report namespace factories', () => {
  const root = path.resolve(import.meta.dirname, '../../server/nocoreach');
  const unclassified = new Set<string>();
  const found = new Set<string>();
  const check = (prefix: string, file: string) => {
    found.add(prefix);
    if (
      !PROJECT_SNAPSHOTS.has(prefix) &&
      !SHARED_SNAPSHOTS.has(prefix) &&
      !NON_SNAPSHOT_PREFIXES.has(prefix)
    )
      unclassified.add(`${file}: ${prefix}`);
  };
  for (const file of readdirSync(root, { recursive: true }) as string[]) {
    if (!file.endsWith('.ts') || file.startsWith('demo-data/')) continue;
    const source = ts.createSourceFile(
      file,
      readFileSync(path.join(root, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node) => {
      const text = ts.isStringLiteralLike(node)
        ? node.text
        : ts.isTemplateExpression(node)
          ? node.head.text
          : '';
      const prefix = /^([a-z][a-z0-9-]*):/.exec(text)?.[1];
      if (prefix) check(prefix, file);
      // TaskService.key(kind, project, task, id) constructs nr-task-${kind}:... dynamically.
      if (
        file.startsWith('execution/') &&
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'key' &&
        node.arguments.length >= 3 &&
        ts.isStringLiteralLike(node.arguments[0]!)
      )
        check(`nr-task-${node.arguments[0]!.text}`, file);
      if (
        ts.isNewExpression(node) &&
        ['GoogleReportCache', 'Ga4ReportCache'].includes(
          node.expression.getText(source),
        )
      ) {
        const namespace = node.arguments?.[1];
        expect(
          !namespace || ts.isStringLiteralLike(namespace),
          `${file}: report namespace must be explicit`,
        ).toBe(true);
        check(
          namespace && ts.isStringLiteralLike(namespace)
            ? namespace.text
            : 'ga4-reports',
          file,
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect([...unclassified].sort()).toEqual([]);
  expect(found.has('nr-task-op')).toBe(true);
  expect(found.has('google-local-reports')).toBe(true);
  expect(
    [...PROJECT_SNAPSHOTS].filter((key) => SHARED_SNAPSHOTS.has(key)),
  ).toEqual([]);
});

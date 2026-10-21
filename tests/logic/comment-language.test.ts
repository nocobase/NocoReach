// @vitest-environment node

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';

const appRoot = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../..',
);

/**
 * Code comments are written in English and name interface elements by their English labels (AGENTS.md). Comments
 * that still contain Chinese were written before the rule and are counted per file in the baseline; a file may lose
 * them but never gain them. After cleaning comments up, lower the baseline with
 * `COMMENT_LANGUAGE_BASELINE=lower pnpm exec vitest run tests/logic/comment-language.test.ts`, which never raises a
 * count. Strings, copy and test data are not comments and are not counted.
 */
const baselinePath = path.join(
  appRoot,
  'tests/logic/comment-language-baseline.json',
);
const DIRECTORIES = [
  'agent',
  'app-plugins',
  'cli',
  'client',
  'server',
  'shared',
  'tests',
];
const SKIP = /(^|\/)(node_modules|dist|\.agents|\.claude)(\/|$)/u;
const SOURCE = /\.(?:[cm]?[jt]sx?)$/u;
const CHINESE = /[㐀-鿿豈-﫿]/u;

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = path.join(directory, entry);
    if (SKIP.test(path.relative(appRoot, entryPath))) return [];
    if (statSync(entryPath).isDirectory()) return sourceFiles(entryPath);
    return SOURCE.test(entry) && !entry.endsWith('.d.ts') ? [entryPath] : [];
  });
}

/** The comments of one file that contain Chinese, with their line numbers. */
function chineseComments(file: string): { line: number; text: string }[] {
  const text = readFileSync(file, 'utf8');
  const kind = /x$/u.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const seen = new Set<number>();
  const found: { line: number; text: string }[] = [];
  const take = (ranges: ts.CommentRange[] | undefined): void => {
    for (const range of ranges ?? []) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      const comment = text.slice(range.pos, range.end);
      if (CHINESE.test(comment)) {
        found.push({
          line: source.getLineAndCharacterOfPosition(range.pos).line + 1,
          text: comment.split('\n')[0].slice(0, 120),
        });
      }
    }
  };
  // Every comment follows some token: a comment on a line of its own is a leading comment of the next token, one
  // after code on the same line (`a: 1, // …`) a trailing comment of the token before it. Punctuation is a token too.
  const visit = (node: ts.Node): void => {
    const children = node.getChildren(source);
    if (children.length) {
      children.forEach(visit);
      return;
    }
    take(ts.getLeadingCommentRanges(text, node.pos));
    take(ts.getTrailingCommentRanges(text, node.end));
  };
  visit(source);
  take(ts.getLeadingCommentRanges(text, source.endOfFileToken.pos));
  return found;
}

it('adds no code comments containing Chinese', () => {
  const current = new Map<string, { line: number; text: string }[]>();
  for (const directory of DIRECTORIES) {
    for (const file of sourceFiles(path.join(appRoot, directory))) {
      const comments = chineseComments(file);
      if (comments.length) current.set(path.relative(appRoot, file), comments);
    }
  }
  const baseline: Record<string, number> = existsSync(baselinePath)
    ? (JSON.parse(readFileSync(baselinePath, 'utf8')) as Record<string, number>)
    : {};
  if (process.env.COMMENT_LANGUAGE_BASELINE === 'lower') {
    const lowered = Object.fromEntries(
      Object.keys(baseline)
        .sort()
        .map(
          (file) =>
            [
              file,
              Math.min(baseline[file], current.get(file)?.length ?? 0),
            ] as const,
        )
        .filter(([, count]) => count > 0),
    );
    writeFileSync(baselinePath, `${JSON.stringify(lowered, null, 2)}\n`);
    return;
  }
  const gained = [...current]
    .filter(([file, comments]) => comments.length > (baseline[file] ?? 0))
    .map(([file, comments]) => ({
      file,
      allowed: baseline[file] ?? 0,
      comments: comments.map((c) => `${file}:${c.line} ${c.text}`),
    }));
  // Name interface elements by their English labels (Settings › Network, Keywords › Saved, Hand off to agent).
  expect(gained).toEqual([]);
});

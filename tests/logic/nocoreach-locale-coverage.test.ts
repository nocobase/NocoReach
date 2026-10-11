// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import english from '../../client/i18n/en.json';

const root = fileURLToPath(new URL('../..', import.meta.url));
const dictionary: Record<string, string> = english;
const sourceFiles = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(file)
      : /\.tsx?$/u.test(entry.name)
        ? [file]
        : [];
  });
const sources = sourceFiles(path.join(root, 'client'))
  .filter((file) => !/[\\/](?:i18n|locales)[\\/]/u.test(file))
  .map((file) =>
    ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    ),
  );
const location = (node: ts.Node) =>
  path.relative(root, node.getSourceFile().fileName) +
  ':' +
  (node.getSourceFile().getLineAndCharacterOfPosition(node.pos).line + 1);

describe('NocoReach Chinese-key translations', () => {
  it('translates every literal $t and $tj call, including multiline calls', () => {
    const missing: string[] = [];
    let checked = 0;
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ['$t', '$tj'].includes(node.expression.getText()) &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        const key = node.arguments[0].text;
        if (/[一-鿿]/u.test(key)) {
          checked++;
          if (dictionary[key] === undefined)
            missing.push(key + ' (' + location(node) + ')');
          const context = node.arguments[2];
          if (
            context &&
            ts.isStringLiteralLike(context) &&
            dictionary[`${key}#${context.text}`] === undefined
          )
            missing.push(`${key}#${context.text} (${location(node)})`);
        }
      }
      ts.forEachChild(node, visit);
    };
    sources.forEach(visit);
    expect(checked).toBeGreaterThan(3000);
    expect(missing).toEqual([]);
  });

  it('does not freeze translated labels at module evaluation time', () => {
    const frozen: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isFunctionLike(node)) return;
      if (
        ts.isCallExpression(node) &&
        ['$t', '$tj', 'isChinese'].includes(node.expression.getText())
      )
        frozen.push(location(node));
      ts.forEachChild(node, visit);
    };
    sources.forEach(visit);
    expect(frozen).toEqual([]);
  });

  it('defers persistent messages, confirmations and memoized table headers', () => {
    const frozen: string[] = [];
    const hasEagerTranslation = (node: ts.Node): boolean => {
      if (ts.isFunctionLike(node)) return false;
      if (
        ts.isCallExpression(node) &&
        ['$t', '$tj'].includes(node.expression.getText())
      )
        return true;
      return node.getChildren().some(hasEagerTranslation);
    };
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText();
        if (
          /^(?:set(?:Error|LoadError|Notice|Done)|confirmAction|toast\.(?:error|success|warning|info))$/u.test(
            name,
          ) &&
          node.arguments.some(hasEagerTranslation)
        )
          frozen.push(location(node));
        if (
          name === 'useMemo' &&
          node.arguments[0] &&
          ts.isArrowFunction(node.arguments[0])
        ) {
          const checkHeaders = (child: ts.Node) => {
            if (
              ts.isPropertyAssignment(child) &&
              child.name.getText() === 'header' &&
              hasEagerTranslation(child.initializer)
            )
              frozen.push(location(child));
            ts.forEachChild(child, checkHeaders);
          };
          checkHeaders(node.arguments[0].body);
        }
      }
      ts.forEachChild(node, visit);
    };
    sources
      .filter((source) => !source.fileName.includes('/extensions/'))
      .forEach(visit);
    expect(frozen).toEqual([]);
  });

  it('preserves interpolation slots and only keeps the language endonym untranslated', () => {
    const slots = (value: string) =>
      [...new Set(value.match(/\{\d+\}/gu) || [])].sort();
    expect(
      Object.entries(dictionary).filter(
        ([key, value]) =>
          JSON.stringify(slots(key)) !== JSON.stringify(slots(value)),
      ),
    ).toEqual([]);
    expect(
      Object.entries(dictionary).filter(([, value]) => /[一-鿿]/u.test(value)),
    ).toEqual([['简体中文', '简体中文']]);
  });
});

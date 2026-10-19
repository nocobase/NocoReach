import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { startupPages } from '../shared/startup-pages.js';
import { routePrefetchPages } from './route-prefetch.js';

type Catalog = Record<string, string>;

/** Keep historical system text available on every business page. Only explicit
 * compatibility entries may be reconstructed; arbitrary Chinese UI text is not an alias. */
export function packMessages(
  chinese: Catalog,
  english: Catalog,
  legacy: Catalog,
) {
  const indices = new Map(
    Object.keys(chinese).map((key, index) => [key, index]),
  );
  const aliases: number[] = [];
  const overrides: Catalog = {};
  for (const [text, key] of Object.entries(legacy)) {
    if (!indices.has(key)) continue;
    if (chinese[key] === text) aliases.push(indices.get(key)!);
    else overrides[text] = key;
  }
  return { chinese, english, aliases, legacy: overrides };
}

/** Find copy in the main workspace's application-owned dependency graph without
 * executing modules. Dynamic keys select their entire semantic group. */
export function workspaceMessageKeys(
  root: string,
  chinese: Catalog,
  legacy: Catalog,
  watch: (file: string) => void,
): Set<string> {
  const keys = new Set(Object.values(legacy));
  const groups = new Map<string, string[]>();
  for (const key of Object.keys(chinese)) {
    const group = key.split('.')[0];
    const values = groups.get(group) ?? [];
    values.push(key);
    groups.set(group, values);
  }
  // Legacy sentence matching also uses interpolated templates that have no exact
  // alias. Keep their complete set and canonical order in one scope.
  for (const [key, value] of Object.entries(chinese)) {
    if (/\{\d+\}/.test(value)) keys.add(key);
  }
  const visited = new Set<string>();
  const imports = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ).imports as Record<string, string>;
  const resolve = (specifier: string, importer: string) => {
    let name = specifier;
    if (name.startsWith('#')) {
      const mapping = Object.entries(imports).find(([key]) =>
        key.endsWith('*') ? name.startsWith(key.slice(0, -1)) : key === name,
      );
      if (!mapping) throw new Error(`Unknown application import: ${name}`);
      name = path.resolve(
        root,
        mapping[1].replace('*', name.slice(mapping[0].indexOf('*'))),
      );
    } else if (name.startsWith('.'))
      name = path.resolve(path.dirname(importer), name);
    else return;
    const stem = name.replace(/\.[cm]?jsx?$/, '');
    return [
      name,
      stem + '.ts',
      stem + '.tsx',
      path.join(stem, 'index.ts'),
      path.join(stem, 'index.tsx'),
    ].find((file) => /\.[cm]?[jt]sx?$/.test(file) && existsSync(file));
  };
  const visit = (file: string, followImports = true) => {
    if (visited.has(file)) return;
    visited.add(file);
    watch(file);
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    // The adapter contains dynamic system-error keys, but its resource loader is not a page dependency.
    const adapter = file === path.join(root, 'client/i18n/index.tsx');
    const inspect = (node: ts.Node) => {
      if (ts.isStringLiteralLike(node)) {
        if (Object.hasOwn(chinese, node.text)) keys.add(node.text);
        // Prefix variables and concatenation also declare a dynamic semantic group.
        for (const key of groups.get(node.text.replace(/\.$/, '')) ?? [])
          keys.add(key);
      }
      if (ts.isTemplateExpression(node)) {
        for (const key of groups.get(node.head.text.split('.')[0]) ?? [])
          if (key.startsWith(node.head.text) && node.head.text.includes('.'))
            keys.add(key);
      }
      if (!adapter && followImports) {
        let specifier: string | undefined;
        if (
          (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) ||
          (ts.isExportDeclaration(node) && !node.isTypeOnly)
        ) {
          if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
            specifier = node.moduleSpecifier.text;
        } else if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          specifier = node.arguments[0].text;
        }
        if (specifier) {
          const target = resolve(specifier, file);
          if (target) visit(target);
        }
      }
      ts.forEachChild(node, inspect);
    };
    inspect(source);
  };
  for (const name of Object.keys(startupPages) as Array<
    keyof typeof startupPages
  >) {
    visit(path.join(root, routePrefetchPages[name]));
  }
  // Chat is available from every workspace page; its copy must not add another
  // serial download when its separately deferred body is first opened.
  visit(
    path.join(root, 'client/extensions/nocobase-agent-chat/panel-body.tsx'),
  );
  // Error metadata and other server-owned messages may arrive on any page,
  // including new semantic keys that have no historical alias yet.
  for (const directory of ['server', 'shared']) {
    const base = path.join(root, directory);
    for (const file of readdirSync(base, {
      recursive: true,
      encoding: 'utf8',
    })) {
      if (/\.tsx?$/.test(file)) visit(path.join(base, file), false);
    }
  }
  return keys;
}

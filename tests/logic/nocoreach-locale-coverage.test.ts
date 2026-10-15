// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import english from '../../shared/i18n/en.json';
import chinese from '../../shared/i18n/zh.json';
import legacyKeys from '../../shared/i18n/legacy-keys.json';
import { systemMessageKey } from '../../shared/i18n/messages';
import { SYSTEM_PLAYBOOKS, stagesFor } from '../../shared/playbook-catalog';

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

// Inspect result leaves only: condition operands are business values, not translation keys.
function keyLeaves(node: ts.Expression): ts.StringLiteralLike[] {
  if (ts.isStringLiteralLike(node)) return [node];
  if (ts.isParenthesizedExpression(node)) return keyLeaves(node.expression);
  if (ts.isConditionalExpression(node))
    return [...keyLeaves(node.whenTrue), ...keyLeaves(node.whenFalse)];
  return [];
}

describe('NocoReach semantic-key translations', () => {
  it('uses matching, unique semantic keys for both languages and valid legacy aliases', () => {
    const keys = Object.keys(dictionary);
    expect(Object.keys(chinese).sort()).toEqual([...keys].sort());
    expect(new Set(keys.map((key) => key.toLowerCase())).size).toBe(
      keys.length,
    );
    expect(
      keys.filter(
        (key) => !/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/.test(key),
      ),
    ).toEqual([]);
    // New semantic keys need no fabricated historical Chinese alias.
    expect(
      Object.values(legacyKeys).filter((key) => !keys.includes(key)),
    ).toEqual([]);
    expect(new Set(Object.values(legacyKeys)).size).toBe(
      Object.values(legacyKeys).length,
    );
    // A legacy alias may keep its historical source text while the visible translation is intentionally shortened.
    const changedLegacyCopy: Record<string, string> = {
      // Agents now come from Runner discovery; historical message aliases remain stable.
      '为当前项目选择任务 Agent，并配置它能使用的业务能力。':
        '为项目选择任务 Agent，查看它可使用的业务能力。',
      '创建 Agent 时可选择 NocoReach 研究或社区回复预设。模型、密钥和 Runner 由官方管理页面维护。':
        '接入 Runner 后，由管理员启用发现的 Agent。模型服务与密钥用于应用自身的 AI 调用，可在模型管理页面配置。',
      '在 Agent 的能力设置中授予任务资料读取与草稿暂存。':
        '已启用的 Agent 可读取当前任务资料并暂存草稿，仍受业务权限限制。',
      '在线 Agent 适合研究和草稿；修改仓库或处理 PR 需要 Runner Agent。离线 Runner 可以设为默认，任务将等待它上线。':
        '研究、草稿和仓库任务均由 Runner 执行。离线 Agent 可以设为默认，任务将等待可用的 Runner。',
      '没有可用的共享 Agent': '没有已启用的 Agent',
      '请管理员创建共享 Agent；研究和草稿可使用 Online 或 Runner。':
        '请接入 Runner，并由管理员启用它发现的 Agent。',
      '请选择可用的共享 Agent': '请选择已启用的 Agent。',
      '请选择团队可调用的 Agent': '请选择已启用且可调用的 Agent',

      'AI 写的内容用的语言': 'AI 内容语言',
      '项目模拟已停用，上游请求已阻止。请联系管理员在“模拟数据”中启用此项目。':
        '项目模拟已暂停，上游请求已阻止。请联系管理员为此项目选择模拟网络 Profile。',
      // Preserve historical aliases while reflecting the deliberate Network Profile UI rename.
      '代理 Profile': '网络 Profile',
      '代理 Profile 已保存': '网络 Profile 已保存',
      '代理 Profile 已删除': '网络 Profile 已删除',
      '删除代理 Profile': '删除网络 Profile',
      '尚未添加代理 Profile': '尚未添加网络 Profile',
      '最多添加 50 个代理 Profile': '最多添加 50 个网络 Profile',
      '编辑代理 Profile': '编辑网络 Profile',
      '集中管理代理，由每个接入选择网络出口。':
        '集中管理网络 Profile，在各接入点选择真实代理或模拟响应。',
    };
    for (const [oldKey, key] of Object.entries(legacyKeys)) {
      expect(chinese[key as keyof typeof chinese]).toBe(
        changedLegacyCopy[oldKey] ??
          oldKey.replace(/#(title|tab|heading)$/, ''),
      );
    }
    expect(legacyKeys['AI 写的内容用的语言']).toBe(
      'common.languageAiWrittenContent',
    );
    expect(chinese['common.languageAiWrittenContent']).toBe('AI 内容语言');
    expect(dictionary['common.languageAiWrittenContent']).toBe(
      'AI content language',
    );
  });
  it('has exact English translations for every built-in playbook display field', () => {
    // These dynamic server-produced strings are invisible to the literal-call scan below.
    const copy = new Set(
      SYSTEM_PLAYBOOKS.flatMap((playbook) => [
        playbook.name,
        playbook.description,
        ...playbook.steps.flatMap((step) => [
          step.name,
          step.instruction,
          ...(step.checklist ?? []).map((item) => item.label),
        ]),
        ...stagesFor(playbook).map((stage) => stage.name),
      ]),
    );
    expect(SYSTEM_PLAYBOOKS).toHaveLength(12);
    expect(
      [...copy].filter(
        (text) =>
          text &&
          /[一-鿿]/u.test(text) &&
          (!systemMessageKey(text) ||
            !dictionary[systemMessageKey(text)!].trim()),
      ),
    ).toEqual([]);
  });

  it('translates every literal $t and $tj result, including nested conditional leaves', () => {
    const missing: string[] = [];
    let checked = 0;
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ['$t', '$tj'].includes(node.expression.getText()) &&
        node.arguments[0]
      ) {
        for (const leaf of keyLeaves(node.arguments[0])) {
          const key = leaf.text;
          if (/[一-鿿]/u.test(key))
            missing.push(
              'Retired Chinese key: ' + key + ' (' + location(node) + ')',
            );
          if (key.includes('.')) {
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
      }
      ts.forEachChild(node, visit);
    };
    sources.forEach(visit);
    expect(checked).toBeGreaterThan(3000);
    expect(missing).toEqual([]);
  });

  it('uses semantic literals in server message producers', () => {
    const missing: string[] = [];
    let count = 0;
    for (const file of [
      ...sourceFiles(path.join(root, 'server')),
      ...sourceFiles(path.join(root, 'shared')),
    ]) {
      const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          node.expression.getText() === 'systemMessageText' &&
          node.arguments[0] &&
          ts.isStringLiteralLike(node.arguments[0])
        ) {
          count++;
          const key = node.arguments[0].text;
          if (!Object.hasOwn(dictionary, key) || /[一-鿿]/u.test(key))
            missing.push(key + ' (' + location(node) + ')');
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(count).toBeGreaterThan(1000);
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
          JSON.stringify(slots(chinese[key as keyof typeof chinese])) !==
          JSON.stringify(slots(value)),
      ),
    ).toEqual([]);
    expect(
      Object.entries(dictionary).filter(([, value]) => /[一-鿿]/u.test(value)),
    ).toEqual([['common.chineseLanguage', '简体中文']]);
  });
});

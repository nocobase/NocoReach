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
    // A legacy alias keeps its historical source text when the visible copy changes.
    const changedLegacyCopy: Record<string, string> = {
      // Opportunities expire 14 days after the last analysis that raised them, not at the next one.
      '已过期：最新的分析没有再提出': '已过期：{0} 天内的分析都没有再提出',
      // Metadata-only collection no longer reads captions; historical aliases remain valid.
      '每词最多 5 条结果，合计最多 15 个视频；不代表完整搜索结果。字幕优先人工，再自动，最多保留 30,000 字符。':
        '每词最多 5 条结果，每次合计最多 15 个视频；不代表完整或最新搜索结果。仅获取视频信息和公开播放、点赞、评论数据，不读取字幕。',
      '每词最多 5 条结果，每次合计最多 15 个视频；不代表完整或最新搜索结果。字幕优先人工，再自动，最多保留 30,000 字符。':
        '每词最多 5 条结果，每次合计最多 15 个视频；不代表完整或最新搜索结果。仅获取视频信息和公开播放、点赞、评论数据，不读取字幕。',
      '相关视频的内容、公开互动计数和可用字幕': '相关视频的信息和公开互动计数',
      // Collector connection setup moved into the platform panels.
      '请管理员按部署文档登记一次已授权的只读采集器，各项目即可选择。采集器必须能从 NocoReach 服务端访问；服务端的回环地址不代表你的电脑。':
        '请管理员在接入面板填写采集器地址和访问令牌。',
      '连接已保存，尚未验证浏览器和登录状态。':
        '采集条件已保存，可以立即搜索。',
      '尚未验证浏览器和小红书登录状态。': '尚未成功采集',
      '请管理员部署采集器，并为此项目启用 Bilibili。':
        '请管理员在接入面板填写采集器地址和访问令牌。',

      '服务器尚未安装 yt-dlp，请管理员按 YouTube 接入文档安装后重试':
        'Collector 尚未安装 yt-dlp，请管理员在 Collector 主机按文档安装后重试',
      '请选择团队可调用的 Agent': '请选择已启用且可调用的 Agent',
      'Agent 和在线 AI 按做法完成的工作，需要你确认时会停下来。':
        'Agent 按做法完成的工作，需要你确认时会停下来。',
      // The Agent page names each AI by what it does (2026-10-20).
      'Runner Agent': '执行 Agent',
      '在线 Agent': '对话 Agent',
      // The task page reworded for marketers: no PR, Runner or push wording.
      'PR 审核已通过。合并并上线后点确认，之后开始观察效果。':
        '已审核通过。改动上线后点确认，之后开始观察效果。',
      发送并要求修改: '发送意见',
      要求修改: '提修改意见',
      '停止不会撤销已经推送的改动或外部操作。': '停止不会撤销已经做出的改动。',
      '已停止，请检查此前已推送的改动或外部操作':
        '已停止。如果之前已经改了网站，请开发同事检查一下',
      '项目默认（未设置或不可用）': '项目默认（未设置）',
      '暂无团队可调用的 Runner Agent，请先创建或联系管理员。':
        '还没有可用的 Agent，请管理员在 AI 团队里接入。',
      '请为这个任务选择一个可用的 Runner Agent。': '请选一个可用的 Agent。',
      'Agent 暂时离线，开始后将等待可用的 Runner。':
        '这个 Agent 现在不在线，开始后会等它连上再做。',

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

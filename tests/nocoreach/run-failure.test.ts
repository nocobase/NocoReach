import { I18nRuntime } from '@nocobase/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectLocale, setDictionary } from '../../client/i18n';
import locales from '../../client/locales';
import {
  failureOf,
  failureStreak,
  sentences,
} from '../../client/pages/task-detail/failure-model';
import type { Run, TaskData } from '../../client/pages/task-execution-types';
import { resultRules } from '../../server/nocoreach/execution/agent-result';
import { AGENT_FAILURE_GROUP, failureGroup } from '../../shared/run-failure';

let disconnect: (() => void) | undefined;
beforeEach(async () => {
  const runtime = new I18nRuntime({
    defaultLocale: 'zh-CN',
    locales: Object.keys(locales),
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  disconnect = connectLocale(runtime);
});
afterEach(() => {
  disconnect?.();
  setDictionary(null);
});

const run = (id: string, over: Partial<Run> = {}): Run => ({
  id,
  status: 'failed',
  planVersion: 0,
  stepId: 'analyze',
  createdAt: `2026-10-24T0${id}:00:00.000Z`,
  ...over,
});
// The task's latest run arrives with its official run (Office-Mac is an example name, not a real computer).
const data = (
  latest: Run,
  failureReason: string | null = null,
): Pick<TaskData, 'execution'> => ({
  execution: {
    runId: latest.id,
    run: {
      failureReason,
      executions: [{ runnerName: 'Office-Mac', tool: 'codex' } as never],
    },
    events: [],
    truncated: false,
    canInspect: true,
  },
});

describe('why a task run failed', () => {
  it('groups a failure by the restart, the official reason, then the Agent’s own code', () => {
    expect(failureGroup({ restartedAt: 'x', failureReason: 'toolAuth' })).toBe(
      'restart',
    );
    expect(failureGroup({ failureReason: 'toolAuth' })).toBe('toolLogin');
    expect(failureGroup({ error: 'agent_failed' }, 'toolRateLimit')).toBe(
      'quota',
    );
    expect(failureGroup({ error: 'missing_tool' })).toBe('missingTool');
    expect(failureGroup({ error: 'tool_signed_out' })).toBe('toolSignIn');
    expect(failureGroup({ error: 'invalid_agent_result' })).toBe('invalid');
    expect(failureGroup({ error: 'agent_failed' })).toBe('task');
  });

  it('asks every Agent for the codes the task page understands', () => {
    const rules = resultRules('plan', 'research').join('\n');
    for (const code of Object.keys(AGENT_FAILURE_GROUP))
      expect(rules).toContain(code);
  });

  // T-35 on Studio (2026-10-24), as an Agent following the new rules would report it.
  it('says a missing tool is the computer’s, in the Agent’s words, and that switching Agent will not help', () => {
    const latest = run('2', {
      error: 'missing_tool',
      errorDetail: '没有安装 GitHub 命令行工具 gh',
    });
    const failure = failureOf(latest, data(latest));
    expect(failure).toMatchObject({
      group: 'missingTool',
      shared: true,
      why: 'Office-Mac 上缺少这一步离不开的工具。Agent 说：没有安装 GitHub 命令行工具 gh',
      next: '请管理这台电脑的人装好它，然后再试一次。',
    });
    expect(failure.next).not.toContain('开发人员');
  });

  it('puts no space after a Chinese full stop, and one between English sentences', () => {
    expect(sentences('装好它。', '换 Agent 解决不了。')).toBe(
      '装好它。换 Agent 解决不了。',
    );
    expect(sentences('Install it.', false, 'Then try again.')).toBe(
      'Install it. Then try again.',
    );
  });

  it('joins Chinese and Japanese text without a space wherever it ends, and drops stray spaces', () => {
    // A sentence without a full stop, one ending in a closing quote or bracket, and a translation's trailing space.
    expect(sentences('这次没读到', '明天会再读。')).toBe(
      '这次没读到明天会再读。',
    );
    expect(sentences('可以点“立即读取”', '或者等明天。')).toBe(
      '可以点“立即读取”或者等明天。',
    );
    expect(sentences('（本月已用 $3）', '明天再读。')).toBe(
      '（本月已用 $3）明天再读。',
    );
    expect(sentences('更新されています。 ', ' 明日も取得します。')).toBe(
      '更新されています。明日も取得します。',
    );
    // English keeps one space, also after a quote, and Korean keeps its spaces between sentences.
    expect(sentences('Click “Read now”', 'to try again.')).toBe(
      'Click “Read now” to try again.',
    );
    expect(sentences('읽지 못했습니다.', '내일 다시 읽습니다.')).toBe(
      '읽지 못했습니다. 내일 다시 읽습니다.',
    );
  });

  it('names the coding tool when it is not signed in, which another coding tool avoids', () => {
    const latest = run('2');
    expect(failureOf(latest, data(latest, 'toolAuth'))).toMatchObject({
      group: 'toolLogin',
      shared: false,
      why: 'Office-Mac 上的 Codex 没有登录。',
      fix: '让管理这台电脑的人登录 Codex，或换一个用其他编码工具的 Agent。',
    });
  });

  it('no longer sends unknown failures to a developer', () => {
    const latest = run('2', {
      error: 'agent_failed',
      errorDetail: 'agent_failed',
    });
    const failure = failureOf(latest, data(latest));
    expect(failure.group).toBe('task');
    expect(failure.why).toBe('这次运行没有完成，也没有留下具体原因。');
    expect(failure.next).toBe(
      '可以再试一次；如果还是不行，给 Agent 留言说明怎么做，或者手动完成这一步。',
    );
  });
});

describe('how often a step failed', () => {
  it('counts the same cause in a row, kept on earlier runs, apart from the streak', () => {
    const runs = [
      run('4'),
      run('3', { failureReason: 'toolAuth' }),
      run('2', { error: 'agent_failed' }),
      run('1', { status: 'succeeded' }),
    ];
    expect(failureStreak(runs, 'toolLogin', data(runs[0], 'toolAuth'))).toEqual(
      {
        failures: 3,
        same: 2,
      },
    );
  });

  it('never calls failures the task gives no reason for the same cause, and skips restarts', () => {
    const runs = [
      run('4', { error: 'agent_failed' }),
      run('3', { restartedAt: 'x' }),
      run('2', { error: 'agent_failed' }),
    ];
    expect(failureStreak(runs, 'task', data(runs[0]))).toEqual({
      failures: 2,
      same: 0,
    });
    expect(
      failureStreak(
        [run('5', { restartedAt: 'x' }), ...runs],
        'restart',
        data(runs[0]),
      ),
    ).toEqual({ failures: 0, same: 0 });
  });

  it('passes over runs a person stopped: a stop is not a failure (2026-11-11)', () => {
    const runs = [
      run('4', { failureReason: 'toolAuth' }),
      run('3', { error: 'cancelled' }),
      run('2', { failureReason: 'toolAuth' }),
      run('1', { status: 'succeeded' }),
    ];
    expect(failureStreak(runs, 'toolLogin', data(runs[0], 'toolAuth'))).toEqual(
      { failures: 2, same: 2 },
    );
  });
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import { OnlineTranscript } from '../../client/online-agent/transcript.js';
import { OnlineError } from '../../client/online-agent/controls.js';
import { OnlineApiError } from '../../client/online-agent/api.js';
import type { OnlineRun } from '../../shared/online-agent.js';

const run: OnlineRun = {
  id: 'reply',
  agentId: 'online-default',
  agentName: '在线助手',
  requestHash: 'hash',
  ownerId: 'owner',
  projectId: null,
  conversationId: 'chat',
  sequence: 0,
  model: { modelService: 'service', model: 'test-model' },
  instructions: '',
  input: '帮我看一下',
  status: 'completed',
  createdAt: '2026-10-16T00:00:00Z',
  startedAt: null,
  finishedAt: null,
  deadline: null,
  holder: null,
  cancelRequested: false,
  output: '',
  events: [],
  usage: { inputTokens: 10, outputTokens: 20 },
  error: null,
  revision: 0,
};
beforeEach(() => setDictionary(null));
afterEach(cleanup);

test('streamed Markdown stays intact and tool calls pair with collapsed results in order', () => {
  const events: OnlineRun['events'] = [
    { type: 'text', text: '**开' },
    { type: 'text', text: '始**\n' },
    {
      type: 'toolCall',
      id: 'tool-1',
      name: 'project_data',
      args: { query: 'overview' },
    },
    {
      type: 'toolResult',
      id: 'tool-1',
      name: 'project_data',
      output: '项目数据结果',
      ok: true,
    },
    { type: 'text', text: '```js\nconst value = ' },
    { type: 'text', text: '1;\n```' },
  ];
  const before = JSON.stringify(events);
  const { container, rerender } = render(
    <OnlineTranscript run={{ ...run, events }} />,
  );
  expect(screen.getByText('开始').tagName).toBe('STRONG');
  expect(screen.getByText('const value = 1;').tagName).toBe('CODE');
  expect(container.querySelectorAll('details')).toHaveLength(2);
  expect(screen.getByText('项目数据结果')).not.toBeVisible();
  expect(screen.getByText(/test-model/)).not.toBeVisible();
  expect(screen.getByText('帮我看一下')).toBeVisible();
  const tool = screen.getByText(/读取项目资料/).closest('details')!;
  expect(tool.previousElementSibling).toHaveTextContent('开始');
  expect(tool.nextElementSibling).toHaveTextContent('const value = 1;');
  tool.open = true;
  expect(screen.getByText('项目数据结果')).toBeVisible();
  rerender(<OnlineTranscript run={{ ...run, events }} />);
  expect(JSON.stringify(events)).toBe(before);
  expect(screen.getAllByText('开始')).toHaveLength(1);
});

test.each([
  ['queued', false, '', '排队中'],
  ['running', false, '', '正在思考…'],
  ['running', false, '已有回复', '正在回复…'],
  ['running', true, '已有回复', '正在停止…'],
  ['cancelled', true, '已有回复', '已停止'],
  ['failed', false, '已有回复', '失败'],
] as const)(
  '%s preserves partial replies and exposes its state',
  (status, cancelRequested, text, label) => {
    render(
      <OnlineTranscript
        run={{
          ...run,
          status,
          cancelRequested,
          events: text ? [{ type: 'text', text }] : [],
        }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(label);
    if (text) expect(screen.getByText(text)).toBeVisible();
  },
);

test('a question asked about an opportunity on Insights shows its quote, not the raw link', () => {
  const { container } = render(
    <OnlineTranscript
      run={{
        ...run,
        input:
          '[O-45 Release notes for v2.2.28](/main/opportunities?item=o45)\nI think they were published',
      }}
    />,
  );
  const message = container.querySelector('[data-chat-message="user"]')!;
  expect(message.textContent).toContain('O-45 Release notes for v2.2.28');
  expect(message.textContent).toContain('I think they were published');
  expect(message.textContent).not.toContain('](');
  expect(screen.queryByRole('link')).toBeNull();
});

test('a reply that stopped partway says why in one quiet line and offers Continue; a real failure keeps the alert', () => {
  const kept: OnlineRun['events'] = [{ type: 'text', text: '## Rising\n' }];
  const onContinue = vi.fn();
  const { rerender } = render(
    <OnlineTranscript
      run={{ ...run, status: 'failed', error: 'stalled', events: kept }}
      onContinue={onContinue}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    '回答没写完：模型连续 90 秒没有新的输出。',
  );
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByText('失败')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '继续' }));
  expect(onContinue).toHaveBeenCalledOnce();

  // Nothing written yet: the same turn is tried again.
  rerender(
    <OnlineTranscript
      run={{ ...run, status: 'failed', error: 'interrupted', events: [] }}
      onContinue={onContinue}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    'NocoReach 服务器当时正在更新或重启',
  );
  expect(screen.getByRole('button', { name: '重试' })).toBeEnabled();

  // An earlier turn, which is not the conversation's latest, says why without a button.
  rerender(
    <OnlineTranscript
      run={{ ...run, status: 'failed', error: 'timeout', events: kept }}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('15 分钟');
  expect(screen.queryByRole('button', { name: '继续' })).toBeNull();

  rerender(
    <OnlineTranscript
      run={{ ...run, status: 'failed', error: 'modelQuota', events: kept }}
      onContinue={onContinue}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('配额不足');
  expect(screen.getByRole('status')).toHaveTextContent('失败');
  expect(screen.queryByRole('button', { name: '继续' })).toBeNull();

  // Replies stored before the unexplained failure got its own code no longer blame the model's configuration.
  rerender(
    <OnlineTranscript
      run={{ ...run, status: 'failed', error: 'modelFailed', events: kept }}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('原因不明');
  expect(screen.getByRole('alert')).not.toHaveTextContent('配置');

  rerender(
    <OnlineTranscript
      run={{
        ...run,
        events: kept,
        output: '## Rising\n',
        continued: [{ at: '2026-10-28T00:00:00Z', after: 'stalled' }],
      }}
    />,
  );
  expect(screen.getByText(/中断后继续过 1 次/)).toBeInTheDocument();
});

test('a request that gets no answer says NocoReach cannot be reached, not to check its configuration', () => {
  const { rerender } = render(
    <OnlineError error={new OnlineApiError(502, 'requestFailed')} />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    '暂时连不上 NocoReach（服务器可能正在更新），请稍后再试。',
  );
  rerender(<OnlineError error={new TypeError('Failed to fetch')} />);
  expect(screen.getByRole('alert')).toHaveTextContent('暂时连不上 NocoReach');
  rerender(<OnlineError error={new OnlineApiError(500, 'requestFailed')} />);
  expect(screen.getByRole('alert')).toHaveTextContent(
    '操作没有完成，请稍后重试。',
  );
});

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { setDictionary } from '../../client/i18n';
import { OnlineTranscript } from '../../client/online-agent/transcript.js';
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

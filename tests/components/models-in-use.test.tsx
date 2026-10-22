import { render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { ModelsInUse } from '../../client/pages/agents/models-in-use';

const state = vi.hoisted(() => ({
  catalog: undefined as unknown,
  definitions: [] as unknown[],
}));
vi.mock('../../client/online-agent/api', () => ({
  useOnlineResource: (path: string) =>
    path === 'models' ? { data: state.catalog } : { data: state.definitions },
}));
beforeEach(() => {
  state.catalog = {
    services: [
      {
        name: 'openai-compatible',
        title: 'OpenAI-compatible',
        models: [
          { value: 'deepseek-v4.1-flash', label: 'deepseek-v4.1-flash' },
          { value: 'deepseek-v4.1-pro', label: 'deepseek-v4.1-pro' },
        ],
      },
    ],
    defaultModel: {
      modelService: 'openai-compatible',
      model: 'deepseek-v4.1-flash',
    },
  };
  state.definitions = [
    {
      id: 'online',
      name: 'Online Agent',
      enabled: true,
      ready: true,
      model: null,
    },
  ];
});

// Under Agent › Model services (2026-10-22 user report): the plugin's table lists services only, so the model named in
// Who does the work has to be findable here, with who uses it.
test('lists each chat model with its service and who uses it', () => {
  render(<ModelsInUse />);
  expect(screen.getByRole('heading', { name: '对话模型' })).toBeVisible();
  const items = screen.getAllByRole('listitem').map((item) => item.textContent);
  expect(items).toEqual([
    'deepseek-v4.1-flash · OpenAI-compatible · 每日分析、对话栏在用',
    'deepseek-v4.1-pro · OpenAI-compatible · 没有在用',
  ]);
});

test('a chat agent with its own model uses that one', () => {
  state.definitions = [
    {
      id: 'online',
      name: 'Online Agent',
      enabled: true,
      ready: true,
      model: { modelService: 'openai-compatible', model: 'deepseek-v4.1-pro' },
    },
  ];
  render(<ModelsInUse />);
  expect(
    screen.getAllByRole('listitem').map((item) => item.textContent),
  ).toEqual([
    'deepseek-v4.1-flash · OpenAI-compatible · 每日分析在用',
    'deepseek-v4.1-pro · OpenAI-compatible · 对话栏在用',
  ]);
});

test('shows nothing without a chat model', () => {
  state.catalog = { services: [], defaultModel: null };
  const { container } = render(<ModelsInUse />);
  expect(container).toBeEmptyDOMElement();
});

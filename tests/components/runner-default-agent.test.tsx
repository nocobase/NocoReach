import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import {
  createTestI18nRuntime,
  TestI18nProvider,
} from '@nocobase/i18n/testing';
import agentsZhCN from '../../node_modules/@nocobase/app-plugin-agents/dist/client/locales/zh-CN.js';
import LocalAgentsPage from '../../client/pages/agents/runner';

vi.mock('@nocobase/app-plugin-agents/client/kit', () => ({
  RunnerAgentsSection: () => (
    <section aria-labelledby='agents-runner-heading'>
      <h2 id='agents-runner-heading'>运行环境上报的本地 Agent</h2>
      <p>Runner list</p>
    </section>
  ),
}));

// Agent › Local agents (2026-10-22 user decision): one description and the plugin's list. The project default moved to
// the overview's Tasks › Settings dialog, and the tab bar already names the tab.
test('uses the plugin description and list, without the project default or a visible heading', async () => {
  const runtime = await createTestI18nRuntime({
    locale: 'zh-CN',
    namespaces: { '@nocobase/app-plugin-agents': agentsZhCN },
  });
  render(
    <TestI18nProvider runtime={runtime} namespace='nocoreach'>
      <LocalAgentsPage />
    </TestI18nProvider>,
  );
  expect(screen.getByText(agentsZhCN.agents.description)).toBeVisible();
  expect(screen.getByText('Runner list')).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.queryByText('项目默认 Agent')).toBeNull();
  // Both headings stay for screen readers and are hidden on screen.
  expect(screen.getByRole('heading', { name: '本地 Agent' })).toHaveClass(
    'sr-only',
  );
  expect(
    screen.getByText('Runner list').closest('section')?.parentElement
      ?.className,
  ).toContain('[&_#agents-runner-heading]:sr-only');
});

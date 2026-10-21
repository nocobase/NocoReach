import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import DemoManagementPage from '../../client/pages/demo-management';
import { setDictionary } from '../../client/i18n';
const state = vi.hoisted(() => ({
  access: {
    revision: 0,
    mode: 'read-only',
    enabled: true,
    visible: true,
    pending: false,
    readData: false,
    manageData: false,
    readConfiguration: true,
    configure: false,
    manageRoles: false,
  },
  config: {
    busy: false,
    revision: 0,
    rules: [],
    mocks: { 'fixture.runner': true },
    schedule: null,
    mode: 'read-only',
    fixedTables: ['session', 'verification'],
    capabilities: [],
    adapters: [
      {
        id: 'fixture.runner',
        title: 'Fixture Runner',
        kind: 'runner',
        scope: 'demo-projects',
        defaultEnabled: true,
      },
    ],
    legacySchedule: null,
    nextRun: null,
  },
  api: { request: vi.fn() },
}));
vi.mock('@nocobase/app-client', () => ({
  useApiClient: () => state.api,
  useNavigationGuard: vi.fn(),
}));
vi.mock('../../client/pages/demo-management/access', () => ({
  useDemoAccess: () => state.access,
}));
vi.mock('../../client/pages/demo-data', () => ({
  default: () => <div>Dataset panel</div>,
}));
const show = () =>
  render(
    <TestI18nProvider runtime={createTestI18nRuntime({ locale: 'en-US' })}>
      <MemoryRouter>
        <DemoManagementPage />
      </MemoryRouter>
    </TestI18nProvider>,
  );
beforeEach(() => {
  state.access = {
    ...state.access,
    enabled: true,
    visible: true,
    readData: false,
    manageData: false,
    readConfiguration: true,
    configure: false,
  };
  state.config.busy = false;
  state.api.request.mockResolvedValue({ data: state.config });
  setDictionary(null);
});
afterEach(cleanup);
it('allows configuration readers to inspect but not change adapters', async () => {
  show();
  await waitFor(() =>
    expect(
      screen.getByRole('checkbox', { name: 'Fixture Runner' }),
    ).toHaveAttribute('aria-disabled', 'true'),
  );
  expect(screen.queryAllByRole('button', { name: '保存' })).toHaveLength(0);
  expect(screen.queryByText('Dataset panel')).not.toBeInTheDocument();
});
it('supports configuration administrators without data access', async () => {
  state.access.configure = true;
  show();
  await waitFor(() =>
    expect(
      screen.getByRole('checkbox', { name: 'Fixture Runner' }),
    ).toBeEnabled(),
  );
  expect(screen.getAllByRole('button', { name: '保存' })).toHaveLength(3);
  expect(screen.queryByText('Dataset panel')).not.toBeInTheDocument();
});
it('supports data-only access without exposing configuration', async () => {
  state.access.readData = true;
  state.access.readConfiguration = false;
  show();
  expect(screen.getByText('Dataset panel')).toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
it('blocks configuration edits during lifecycle operations and hides the disabled environment', async () => {
  state.access.configure = true;
  state.config.busy = true;
  const page = show();
  await waitFor(() =>
    expect(
      screen.getByRole('checkbox', { name: 'Fixture Runner' }),
    ).toHaveAttribute('aria-disabled', 'true'),
  );
  page.unmount();
  state.access.enabled = false;
  state.access.visible = false;
  show();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByText('Dataset panel')).not.toBeInTheDocument();
});

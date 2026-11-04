import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  createTestI18nRuntime,
  TestI18nProvider,
} from '@nocobase/i18n/testing';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import demoEn from '../../node_modules/@nocobase/app-plugin-demo-mode/dist/client/locales/en-US.js';
import { HeaderDemoModeMenu } from '../../client/layouts/components/demo-mode-menu.js';
import { setDictionary } from '../../client/i18n/index.js';

const state = vi.hoisted(() => ({
  enabled: true,
  compact: true,
  accounts: null as
    null | { username: string; name: string; role: string; current: boolean }[],
  signIn: vi.fn(),
  show: vi.fn(),
}));
vi.mock('@nocobase/app-plugin-demo-mode/client', () => ({
  useDemoMode: () => state.enabled,
}));
vi.mock('@nocobase/app-plugin-demo-mode/client/accounts', () => ({
  useDemoAccounts: () => state,
}));
vi.mock('@nocobase/app-plugin-demo-mode/client/menu', () => ({
  DemoModeMenu: () =>
    state.enabled ? <button>Original desktop menu</button> : null,
}));
vi.mock('../../client/hooks/use-media-query.js', () => ({
  useMediaQuery: () => state.compact,
}));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useToaster: () => ({ show: state.show }),
}));

beforeEach(() => {
  state.enabled = true;
  state.compact = true;
  state.accounts = [
    {
      username: 'admin',
      name: 'Administrator',
      role: 'Super Admin',
      current: true,
    },
    { username: 'member', name: 'Demo member', role: 'Member', current: false },
  ];
  state.signIn.mockReset();
  state.show.mockReset();
  setDictionary({ 'demoData.badge': 'Demo' }, 'en-US');
});
async function setup() {
  const runtime = await createTestI18nRuntime({
    namespaces: { '@nocobase/app-plugin-demo-mode': demoEn },
  });
  return render(
    <TestI18nProvider runtime={runtime}>
      <MemoryRouter initialEntries={['/keywords?tab=saved#results']}>
        <HeaderDemoModeMenu />
      </MemoryRouter>
    </TestI18nProvider>,
  );
}

it('keeps the desktop entry and renders nothing outside demo mode', async () => {
  state.compact = false;
  const view = await setup();
  expect(
    screen.getByRole('button', { name: 'Original desktop menu' }),
  ).toBeVisible();
  state.enabled = false;
  view.rerender(<HeaderDemoModeMenu />);
  expect(screen.queryByRole('button')).toBeNull();
});

it('keeps the notice available while loading and when no account can be entered', async () => {
  state.accounts = null;
  const view = await setup();
  fireEvent.click(screen.getByRole('button', { name: 'Demo mode' }));
  expect(await screen.findByText(demoEn.menu.description)).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent(demoEn.menu.loading);
  view.unmount();
  state.accounts = [];
  await setup();
  fireEvent.click(screen.getByRole('button', { name: 'Demo mode' }));
  expect(await screen.findByRole('status')).toHaveTextContent(
    demoEn.accounts.unavailable,
  );
});

it('shows the current account and preserves the complete location while switching', async () => {
  let finish!: () => void;
  state.signIn.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await setup();
  const trigger = screen.getByRole('button', {
    name: 'Demo mode · Switch account',
  });
  expect(trigger).toHaveTextContent('Demo');
  fireEvent.click(trigger);
  const current = await screen.findByRole('menuitemradio', {
    name: /Administrator.*Super Admin/,
  });
  expect(current).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(current);
  expect(state.signIn).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('menuitemradio', { name: /Demo member.*Member/ }),
  );
  expect(state.signIn).toHaveBeenCalledExactlyOnceWith(
    'member',
    '/keywords?tab=saved#results',
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    demoEn.accounts.entering,
  );
  expect(
    screen
      .getAllByRole('menuitemradio')
      .every((item) => item.hasAttribute('aria-disabled')),
  ).toBe(true);
  await act(async () => finish());
});

it('reports a failed switch and allows retrying', async () => {
  state.signIn.mockRejectedValueOnce(new Error('Failed'));
  await setup();
  fireEvent.click(
    screen.getByRole('button', { name: 'Demo mode · Switch account' }),
  );
  const member = await screen.findByRole('menuitemradio', {
    name: /Demo member.*Member/,
  });
  fireEvent.click(member);
  await waitFor(() =>
    expect(state.show).toHaveBeenCalledWith({
      type: 'error',
      title: demoEn.accounts.failed,
    }),
  );
  expect(member).not.toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(member);
  expect(state.signIn).toHaveBeenCalledTimes(2);
});

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { AppThemeProvider } from '../../client/theme/index.js';
import { UserMenu } from '../../client/layouts/components/user-menu.js';
import locales from '../../client/locales/index.js';

const fixture = vi.hoisted(() => ({ authenticated: true, prefersDark: false }));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    session: fixture.authenticated
      ? { user: { id: 'operator', name: 'Operator' } }
      : null,
    isPending: false,
  }),
}));
vi.mock('../../client/pages/access/api.js', () => ({
  usePendingInvitationCount: () => 0,
}));
vi.mock('../../client/layouts/components/language-switcher.js', () => ({
  LanguageSwitcher: () => null,
}));

beforeEach(() => {
  fixture.authenticated = true;
  fixture.prefersDark = false;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' && fixture.prefersDark,
    addListener() {},
    removeListener() {},
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function renderMenu(locale = 'en-US') {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: Object.keys(locales),
    applicationNamespace: 'test-app',
  });
  runtime.registerApplicationNamespace('test-app', locales);
  await runtime.init(locale);
  return render(
    <I18nProvider runtime={runtime}>
      <MemoryRouter>
        <AppThemeProvider>
          <UserMenu />
        </AppThemeProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

async function openAppearance() {
  act(() => screen.getByRole('button', { name: 'Open account menu' }).focus());
  await userEvent.keyboard('{Enter}');
  const appearance = await screen.findByRole('menuitem', {
    name: /^Theme/,
  });
  act(() => appearance.focus());
  await userEvent.keyboard('{ArrowRight}');
  return appearance;
}

it.each([
  ['Light', 'color-scheme', 'light'],
  ['Dark', 'color-scheme', 'dark'],
  ['System', 'color-scheme', 'system'],
  ['Compact', 'preset', 'compact'],
  ['Spacious', 'preset', 'default'],
])(
  'saves %s from the account submenu and restores it on remount',
  async (label, key, value) => {
    const view = await renderMenu();
    expect(screen.queryByRole('button', { name: 'Appearance' })).toBeNull();
    await openAppearance();
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: label }),
    );
    await waitFor(() =>
      expect(localStorage.getItem(`nocobase:main:theme:${key}`)).toBe(value),
    );
    expect(screen.getAllByRole('menu')).toHaveLength(2);
    if (key === 'color-scheme') {
      expect(
        screen.getByRole('menuitem', {
          name: new RegExp('^Theme\\s*' + label + '$'),
        }),
      ).toBeVisible();
    }
    await userEvent.keyboard('{Escape}{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(
      screen.getByRole('button', { name: 'Open account menu' }),
    ).toHaveFocus();
    view.unmount();
    await renderMenu();
    await openAppearance();
    expect(
      await screen.findByRole('menuitemradio', { name: label }),
    ).toHaveAttribute('aria-checked', 'true');
  },
);

it('returns from the submenu and restores the account trigger with Escape', async () => {
  await renderMenu();
  const appearance = await openAppearance();
  expect(
    await screen.findByRole('menuitemradio', { name: 'Light' }),
  ).toBeVisible();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(appearance).toHaveFocus());
  await userEvent.keyboard('{Escape}');
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Open account menu' }),
    ).toHaveFocus(),
  );
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
});

it('selects a color mode using only the keyboard', async () => {
  await renderMenu();
  await openAppearance();
  const dark = await screen.findByRole('menuitemradio', { name: 'Dark' });
  act(() => dark.focus());
  await userEvent.keyboard('{Enter}');
  await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  expect(localStorage.getItem('nocobase:main:theme:color-scheme')).toBe('dark');
  expect(screen.getAllByRole('menu')).toHaveLength(2);
  expect(
    screen.getByRole('menuitem', { name: /^Theme\s*Dark$/ }),
  ).toBeVisible();
});

it('keeps Theme available in an anonymous account menu', async () => {
  fixture.authenticated = false;
  await renderMenu();
  await openAppearance();
  expect(await screen.findAllByRole('menuitemradio')).toHaveLength(5);
});

it('uses translated Chinese labels for both groups', async () => {
  await renderMenu('zh-CN');
  act(() => screen.getByRole('button', { name: '打开账户菜单' }).focus());
  await userEvent.keyboard('{Enter}');
  act(() => screen.getByRole('menuitem', { name: /^主题/ }).focus());
  await userEvent.keyboard('{ArrowRight}');
  expect(
    await screen.findByRole('menuitemradio', { name: '宽松' }),
  ).toBeVisible();
  expect(screen.getByText('密度', { exact: true })).toBeVisible();
  expect(screen.getByText('颜色模式', { exact: true })).toBeVisible();
});

it('shows System rather than its resolved dark mode in the summary', async () => {
  fixture.prefersDark = true;
  localStorage.setItem('nocobase:main:theme:color-scheme', 'system');
  await renderMenu();
  await openAppearance();
  expect(
    await screen.findByRole('menuitem', { name: /^Theme\s*System$/ }),
  ).toBeVisible();
  expect(screen.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
});

it('keeps color and density independently selected during consecutive choices', async () => {
  await renderMenu();
  await openAppearance();
  await userEvent.click(
    await screen.findByRole('menuitemradio', { name: 'Dark' }),
  );
  await userEvent.click(
    screen.getByRole('menuitemradio', { name: 'Spacious' }),
  );
  expect(screen.getAllByRole('menu')).toHaveLength(2);
  expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(
    screen.getByRole('menuitemradio', { name: 'Spacious' }),
  ).toHaveAttribute('aria-checked', 'true');
  expect(
    screen.getByRole('menuitem', { name: /^Theme\s*Dark$/ }),
  ).toBeVisible();
  await userEvent.click(screen.getByRole('menuitemradio', { name: 'Light' }));
  await userEvent.click(screen.getByRole('menuitemradio', { name: 'Compact' }));
  expect(screen.getAllByRole('menu')).toHaveLength(2);
  expect(screen.getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(
    screen.getByRole('menuitemradio', { name: 'Compact' }),
  ).toHaveAttribute('aria-checked', 'true');
  expect(localStorage.getItem('nocobase:main:theme:color-scheme')).toBe(
    'light',
  );
  expect(localStorage.getItem('nocobase:main:theme:preset')).toBe('compact');
  expect(
    screen
      .getAllByRole('menuitemradio')
      .filter((item) => item.getAttribute('aria-checked') === 'true'),
  ).toHaveLength(2);
});

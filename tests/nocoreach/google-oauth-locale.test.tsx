import { act, cleanup, render, screen } from '@testing-library/react';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { connectLocale, setDictionary } from '../../client/i18n';
import locales from '../../client/locales';
import { GoogleConnection } from '../../client/pages/google-connection';
import english from '../../shared/i18n/en.json';
import chinese from '../../shared/i18n/zh.json';

vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: {
    wrapRequests: () => {},
    action: vi.fn(async () => ({ configured: true, authorized: false })),
  },
}));

let disconnect: (() => void) | undefined;
afterEach(() => {
  cleanup();
  disconnect?.();
  disconnect = undefined;
  window.history.replaceState(null, '', '/');
  setDictionary(null);
});

it.each([
  ['initiator_access_denied', 'google.initiatorAccessDenied'],
  ['authorization_denied', 'google.googleNotApproveAuthorizationCheck'],
] as const)(
  'explains %s and updates the rendered language',
  async (reason, key) => {
    window.history.replaceState(null, '', `/?google=error&reason=${reason}`);
    const runtime = new I18nRuntime({
      defaultLocale: 'zh-CN',
      locales: ['zh-CN', 'en-US'],
      applicationNamespace: 'nocoreach',
    });
    runtime.registerApplicationNamespace('nocoreach', locales);
    await runtime.init();
    disconnect = connectLocale(runtime);
    render(
      <I18nProvider runtime={runtime}>
        <MemoryRouter>
          <GoogleConnection projectId='123' />
        </MemoryRouter>
      </I18nProvider>,
    );
    await screen.findByText(chinese['google.authorizeGoogleAccount']);
    expect(screen.getByRole('alert')).toHaveTextContent(chinese[key]);
    await act(() => runtime.changeLanguage('en-US'));
    expect(screen.getByRole('alert')).toHaveTextContent(english[key]);
  },
);

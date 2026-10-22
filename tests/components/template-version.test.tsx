import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppVersion } from '../../client/layouts/components/app-version';
import locales from '../../client/locales';

// The account menu's version line; the menu itself is covered in client-shell.test.tsx.
afterEach(() => vi.unstubAllGlobals());

describe('template version translations', () => {
  it('updates the unknown state when switching languages', async () => {
    vi.stubGlobal('__NOCOREACH_TEMPLATE_VERSION__', null);
    const runtime = new I18nRuntime({
      defaultLocale: 'en-US',
      locales: ['en-US', 'zh-CN'],
      applicationNamespace: 'nocoreach',
    });
    runtime.registerApplicationNamespace('nocoreach', locales);
    await runtime.init();
    render(
      <I18nProvider runtime={runtime}>
        <AppVersion />
      </I18nProvider>,
    );
    expect(screen.getByText('NocoReach Version unknown')).toBeVisible();
    await act(() => runtime.changeLanguage('zh-CN'));
    expect(screen.getByText('NocoReach 版本未知')).toBeVisible();
  });
});

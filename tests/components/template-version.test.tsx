import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '../../client/components/ui/sidebar';
import { AppSidebarFooter } from '../../client/layouts/components/sidebar-footer';
import locales from '../../client/locales';

// The indicator's authenticated API states are covered in mock-settings.test.tsx.
// This footer-only harness checks template metadata and locale switching.
vi.mock('../../client/mock-integrations.js', () => ({
  MockIndicator: ({ fallback }: { fallback: ReactNode }) => fallback,
}));

afterEach(() => vi.unstubAllGlobals());

describe('template version translations', () => {
  it('updates the unknown state when switching languages', async () => {
    vi.stubGlobal('__NOCOREACH_TEMPLATE_VERSION__', null);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    const runtime = new I18nRuntime({
      defaultLocale: 'en-US',
      locales: ['en-US', 'zh-CN'],
      applicationNamespace: 'nocoreach',
    });
    runtime.registerApplicationNamespace('nocoreach', locales);
    await runtime.init();
    render(
      <I18nProvider runtime={runtime}>
        <SidebarProvider>
          <AppSidebarFooter />
        </SidebarProvider>
      </I18nProvider>,
    );
    expect(screen.getByText('Version unknown')).toBeVisible();
    await act(() => runtime.changeLanguage('zh-CN'));
    expect(screen.getByText('版本未知')).toBeVisible();
    expect(screen.queryByText('Version unknown')).not.toBeInTheDocument();
  });
});

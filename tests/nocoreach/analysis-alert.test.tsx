import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import {
  connectLocale,
  setDictionary,
  useNocoReachLocale,
} from '../../client/i18n';
import locales from '../../client/locales';
import { AnalysisAlert } from '../../client/pages/strategy/analysis-alert';
import type { AnalysisStatus } from '../../client/pages/strategy/service';
const access = vi.hoisted(() => ({
  read: true,
  manage: true,
  pending: false,
  error: null as Error | null,
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: ({ action }: { action: 'read' | 'manage' }) => ({
    can: access[action],
    isPending: access.pending,
    error: access.error,
  }),
}));
let disconnect: (() => void) | undefined;
afterEach(() => {
  cleanup();
  disconnect?.();
  setDictionary(null);
  Object.assign(access, {
    read: true,
    manage: true,
    pending: false,
    error: null,
  });
});
function View({ status }: { status: AnalysisStatus }) {
  useNocoReachLocale();
  return <AnalysisAlert status={status} busy={false} onRun={() => {}} />;
}
async function setup(
  kind: AnalysisStatus['runs'][number]['failureKind'],
  locale = 'en-US',
  extra: Partial<AnalysisStatus> = {},
) {
  const runtime = new I18nRuntime({
    defaultLocale: locale,
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  disconnect = connectLocale(runtime);
  const status: AnalysisStatus = {
    running: false,
    last: null,
    schedule: null,
    runs: [
      {
        at: new Date().toISOString(),
        trigger: 'workflow',
        ok: false,
        error: 'test error',
        failureKind: kind,
      },
    ],
    ...extra,
  };
  return render(
    <I18nProvider runtime={runtime}>
      <MemoryRouter basename='/main' initialEntries={['/main/']}>
        <View status={status} />
      </MemoryRouter>
    </I18nProvider>,
  );
}
test.each(['en-US', 'zh-CN'])(
  'missing configuration offers a permitted model link without a retry or billing warning: %s',
  async (locale) => {
    await setup('model_configuration', locale);
    expect(screen.getByRole('button')).toHaveAttribute('href', '/main/models');
    expect(screen.queryByText('Run analysis again')).toBeNull();
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      /charged|计费|billing/,
    );
  },
);
test.each(['read', 'manage', 'pending', 'error'])(
  'configuration link fails closed when access is %s',
  async (condition) => {
    if (condition === 'read' || condition === 'manage')
      access[condition] = false;
    if (condition === 'pending') access.pending = true;
    if (condition === 'error')
      access.error = new Error('permission unavailable');
    await setup('model_configuration');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Ask an administrator');
  },
);
test.each([
  ['precondition', 'No model request was made'],
  ['provider_unavailable', 'provider rejected the request'],
  ['billing_unknown', 'may already have been charged'],
  [undefined, 'record has no call-stage information'],
] as const)(
  'shows the evidence-based explanation for %s',
  async (kind, text) => {
    await setup(kind);
    expect(screen.getByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('button')).toHaveTextContent('Run analysis again');
  },
);
test('success and running states hide stale failures', async () => {
  const view = await setup('model_configuration', 'en-US', { running: true });
  expect(screen.queryByRole('alert')).toBeNull();
  view.unmount();
  await setup('model_configuration', 'en-US', {
    runs: [{ at: new Date().toISOString(), trigger: 'manual', ok: true }],
  });
  expect(screen.queryByRole('alert')).toBeNull();
});

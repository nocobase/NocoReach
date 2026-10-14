import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoadError } from '../../client/components/reach/states.js';
import {
  nocobaseClient,
  NocoReachHttpError,
} from '../../client/lib/nocoreach-api.js';
import {
  useFreshData,
  WorkspaceCacheProvider,
} from '../../client/pages/workspace-cache.js';

vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    isPending: false,
    session: { user: { id: 'member' }, session: { id: 'member-session' } },
  }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationRevision: () => 1,
}));

const legacyFailure = {
  error: {
    code: 'INVALID_ARGUMENT',
    status: 'FAILED_PRECONDITION',
    reason: 'NOCOREACH_INVALID_ARGUMENT',
    message:
      'Operator "$gte" is not supported for Field "date" of type "string".',
  },
};

function respond(payload: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(payload), { status })),
  );
}

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('NocoReach action response contract', () => {
  it.each(['search', 'page'])(
    'rejects the legacy HTTP 200 error envelope from nrDataViews/%s',
    async (action) => {
      respond(legacyFailure);
      const error = await nocobaseClient
        .action('nrDataViews', action)
        .catch((error: unknown) => error);
      expect(error).toBeInstanceOf(NocoReachHttpError);
      expect(error).toMatchObject({
        status: 400,
        code: 'NOCOREACH_INVALID_ARGUMENT',
        message: legacyFailure.error.message,
        payload: legacyFailure,
      });
    },
  );

  it.each(['data', 'deep-data', 'none'] as const)(
    'rejects error envelopes before %s unwrapping',
    async (unwrap) => {
      respond({
        error: { code: 403, status: 'PERMISSION_DENIED', reason: 'FORBIDDEN' },
      });
      await expect(
        nocobaseClient.action('nrSources', 'list', { unwrap }),
      ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    },
  );

  it('keeps the transport status and localized message for non-2xx failures', async () => {
    const payload = {
      error: {
        code: 400,
        reason: 'UNAVAILABLE',
        message: 'Internal detail',
        localizedMessage: { message: '服务暂时不可用' },
      },
    };
    respond(payload, 503);
    await expect(
      nocobaseClient.action('nrSources', 'list'),
    ).rejects.toMatchObject({
      status: 503,
      code: 'UNAVAILABLE',
      message: '服务暂时不可用',
      payload,
    });
  });

  it.each([
    ['OUT_OF_RANGE', 400],
    ['UNIMPLEMENTED', 501],
    ['DEADLINE_EXCEEDED', 504],
  ])(
    'maps the canonical %s envelope status to HTTP %s',
    async (status, code) => {
      respond({ error: { status, message: 'Request failed' } });
      await expect(
        nocobaseClient.action('nrDataViews', 'search'),
      ).rejects.toMatchObject({ status: code });
    },
  );

  it.each([undefined, 200, 600, 400.5, 'UNKNOWN'])(
    'uses 500 for an unrecognized envelope code %s',
    async (code) => {
      respond({ error: { code, status: 'UNKNOWN' } });
      await expect(
        nocobaseClient.action('nrSources', 'list'),
      ).rejects.toMatchObject({
        status: 500,
        message: '请求没有完成（500）',
      });
    },
  );

  it.each(['data', 'deep-data', 'none'] as const)(
    'preserves valid %s success unwrapping, including a business data.error field',
    async (unwrap) => {
      const result = {
        connected: true,
        error: { message: 'Last sync failed' },
      };
      const payload = { data: { data: result } };
      respond(payload);
      await expect(
        nocobaseClient.action('nrDataViews', 'search', { unwrap }),
      ).resolves.toEqual(
        unwrap === 'none'
          ? payload
          : unwrap === 'deep-data'
            ? result
            : payload.data,
      );
    },
  );

  it.each([
    { connected: false },
    { error: null, connected: false },
    { data: null },
    [],
    null,
    false,
    0,
    'raw response',
  ])('preserves error-free JSON responses: %j', async (payload) => {
    respond(payload);
    await expect(
      nocobaseClient.action('nrDataViews', 'search'),
    ).resolves.toEqual(payload);
  });

  it('preserves successful non-JSON text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok')),
    );
    await expect(nocobaseClient.action('nrSources', 'list')).resolves.toBe(
      'ok',
    );
  });

  it('preserves non-JSON HTTP failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unavailable', { status: 502 })),
    );
    await expect(
      nocobaseClient.action('nrSources', 'list'),
    ).rejects.toMatchObject({
      status: 502,
      payload: 'unavailable',
      message: '请求没有完成（502）',
    });
  });
});

function ReportProbe({ action }: { action: string }) {
  const { data, error } = useFreshData<{ connected?: boolean }>(
    `data-view:${action}`,
    () => nocobaseClient.action('nrDataViews', action),
  );
  if (error) return <LoadError title='读取失败' />;
  if (!data) return <p>正在读取</p>;
  return <p>{data.connected ? '已连接' : '尚未接入或没有数据'}</p>;
}

it.each(['search', 'page'])(
  'routes nrDataViews/%s failures through useFreshData without caching them',
  async (action) => {
    respond(legacyFailure);
    render(
      <WorkspaceCacheProvider>
        <ReportProbe action={action} />
      </WorkspaceCacheProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('读取失败');
    expect(screen.queryByText('尚未接入或没有数据')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(`nr-cache:data-view:${action}`)).toBeNull();
  },
);

it('explains a disabled simulated project while preserving the machine reason and payload', async () => {
  const payload = {
    error: {
      reason: 'NOCOREACH_409',
      message: 'NR_MOCK_PROJECT_DISABLED',
      localizedMessage: { message: 'NR_MOCK_PROJECT_DISABLED' },
    },
  };
  respond(payload, 409);
  await expect(
    nocobaseClient.action('nrSiteContent', 'discover'),
  ).rejects.toMatchObject({
    status: 409,
    code: 'NOCOREACH_409',
    payload,
    message: 'mock.projectDisabled',
  });
});

it.each(['reason', 'message'] as const)(
  'maps a missing mock Profile in %s to current settings guidance without losing the response',
  async (field) => {
    const payload = { error: { [field]: 'NR_MOCK_PROFILE_REQUIRED' } };
    respond(payload, 409);
    await expect(
      nocobaseClient.action('nrGitHub', 'preview'),
    ).rejects.toMatchObject({
      status: 409,
      payload,
      message: 'networkProfiles.profileRequired',
    });
  },
);

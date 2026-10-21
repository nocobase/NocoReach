import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import english from '../../shared/i18n/en.json';
import { systemMessageText } from '../../shared/i18n/messages';
import { networkFailureEntries } from '../../shared/network-failures';
import { findNetworkFailure } from '../../client/lib/network-failure';
import { $legacyText, $t, setDictionary } from '../../client/i18n';
import {
  ConnectionError,
  NetworkSettingsLink,
} from '../../client/components/connection-error';
import { GitHubConnect } from '../../client/pages/github-connect';
import SkillsPage from '../../client/pages/skills';
import {
  NocoReachHttpError,
  nocobaseClient,
} from '../../client/lib/nocoreach-api';

vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: () => ({ can: true }),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: { id: 1, name: 'Example' } }),
  useUnsavedWarning: () => {},
}));
vi.mock('../../client/lib/nocoreach-api', async (original) => {
  const actual =
    await original<typeof import('../../client/lib/nocoreach-api')>();
  return {
    ...actual,
    nocobaseClient: { ...actual.nocobaseClient, action: vi.fn() },
  };
});
const action = vi.mocked(nocobaseClient.action);

// What the server sends: always the Chinese sentence (systemMessageText's default locale).
const server = (key: string, host = 'github.com') =>
  systemMessageText(key, { 0: host });

afterEach(() => {
  cleanup();
  action.mockReset();
  setDictionary(null);
});
// What a failed request turns into in the page: the server's sentence, as the request layer passes it on.
const failed = (key: string, host = 'github.com') =>
  new NocoReachHttpError(server(key, host), 502, {
    error: { message: server(key, host) },
  });
const inRouter = (ui: React.ReactNode) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('recognizing a request that got no answer in an error', () => {
  it.each(networkFailureEntries.map((entry) => [entry.key, entry]))(
    '%s: in Chinese and English, with the host, the reason and the route',
    (key, entry) => {
      for (const text of [
        server(key),
        systemMessageText(key, { 0: 'github.com' }, 'en-US'),
      ])
        expect(findNetworkFailure(text)).toMatchObject({
          key,
          reason: entry.reason,
          proxied: entry.proxied,
          host: 'github.com',
          before: '',
          after: '',
        });
    },
  );

  it('finds it behind the part that failed, as GitHub sync stores it', () => {
    const failure = findNetworkFailure(
      `仓库：${server('outboundNetwork.failures.proxyTimeout', 'api.github.com')}`,
    );
    expect(failure).toMatchObject({
      reason: 'timeout',
      proxied: true,
      host: 'api.github.com',
      before: '仓库：',
      chinese: true,
    });
  });

  it('does not take other errors, or older ones without a reason, for it', () => {
    expect(findNetworkFailure('直连请求未完成，请检查目标网络')).toBeNull();
    expect(findNetworkFailure('GitHub 拒绝了请求')).toBeNull();
    expect(findNetworkFailure('')).toBeNull();
    expect(findNetworkFailure(undefined)).toBeNull();
  });
});

describe('showing it in English', () => {
  it('translates the whole sentence', () => {
    setDictionary(english);
    expect($legacyText(server('outboundNetwork.failures.directReset'))).toBe(
      "The server can't reach github.com (the connection was interrupted). If the server's network can't reach outside services directly, set up a proxy in Settings › Network.",
    );
  });

  it('translates it behind the part that failed', () => {
    setDictionary(english);
    expect(
      $legacyText(`仓库：${server('outboundNetwork.failures.certificate')}`),
    ).toBe(
      `Repository: ${$t('outboundNetwork.failures.certificate', { 0: 'github.com' })}`,
    );
  });
});

describe('a connection error that is about reaching a site', () => {
  it.each(networkFailureEntries.map((entry) => [entry.key]))(
    '%s: says why and links to Settings › Network',
    (key) => {
      inRouter(<ConnectionError message={server(key)} />);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(server(key));
      expect(
        within(alert).getByRole('link', { name: '去网络设置' }),
      ).toHaveAttribute('href', '/proxy-profiles');
    },
  );

  it('shows the English sentence with the same link', () => {
    setDictionary(english);
    inRouter(
      <ConnectionError
        message={$legacyText(server('outboundNetwork.failures.proxyTimeout'))}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      "The server can't reach github.com through the proxy (the connection timed out).",
    );
    expect(
      screen.getByRole('link', { name: 'Open network settings' }),
    ).toBeInTheDocument();
  });

  it('explains the company root certificate in ⓘ', async () => {
    inRouter(
      <ConnectionError
        message={server('outboundNetwork.failures.certificate')}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: '怎样添加公司根证书' }),
    );
    expect(await screen.findByText(/NODE_EXTRA_CA_CERTS/)).toBeInTheDocument();
  });

  it('leaves other errors as they were', () => {
    inRouter(<ConnectionError message='GitHub 拒绝了请求' />);
    expect(screen.getByRole('alert')).toHaveTextContent('GitHub 拒绝了请求');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('links an error the caller knows is about the network, such as Google authorization', () => {
    inRouter(<ConnectionError message='后台无法连接 Google' network />);
    expect(
      screen.getByRole('link', { name: '去网络设置' }),
    ).toBeInTheDocument();
  });

  it('links saved collection errors only when one of them is about reaching a site', () => {
    const { rerender } = inRouter(
      <NetworkSettingsLink messages={['Traffic：需要 push 权限']} />,
    );
    expect(screen.queryByRole('link')).toBeNull();
    rerender(
      <MemoryRouter>
        <NetworkSettingsLink
          messages={[
            'Traffic：需要 push 权限',
            `仓库：${server('outboundNetwork.failures.directReset')}`,
          ]}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('link', { name: '去网络设置' }),
    ).toBeInTheDocument();
  });
});

describe('where connections are made', () => {
  it('GitHub: reading a repository the server cannot reach says why, with the link', async () => {
    action.mockImplementation(async (_resource: string, name: string) => {
      if (name === 'status') return { connected: false };
      throw failed('outboundNetwork.failures.directReset', 'api.github.com');
    });
    inRouter(
      <GitHubConnect
        projectId={1}
        focus='repo'
        suggestedUrl='https://github.com/acme/site'
        onChange={() => {}}
      />,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: '读取仓库' }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      '服务器连不上 api.github.com（连接被中断）',
    );
    expect(
      within(alert).getByRole('link', { name: '去网络设置' }),
    ).toBeInTheDocument();
  });

  it('GitHub: a sync that partly failed links to Settings › Network', async () => {
    action.mockResolvedValue({
      connected: true,
      repo: 'acme/site',
      url: 'https://github.com/acme/site',
      lastSync: {
        at: '2026-10-20T00:00:00Z',
        ok: false,
        errors: [
          `仓库：${server('outboundNetwork.failures.proxyTimeout', 'api.github.com')}`,
        ],
      },
    });
    inRouter(<GitHubConnect projectId={1} focus='repo' onChange={() => {}} />);
    expect(
      await screen.findByText(/通过代理连不上 api.github.com（连接超时）/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '去网络设置' }),
    ).toBeInTheDocument();
  });

  it('Skill link import: also offers uploading the folder instead', async () => {
    action.mockImplementation(async (resource: string, name: string) => {
      if (resource === 'nrPlaybooks') return { revision: 1, playbooks: [] };
      if (name === 'list') return { revision: 1, skills: [] };
      if (name === 'readLink')
        throw failed('outboundNetwork.failures.directTimeout');
      throw new Error(`Unexpected ${resource}/${name}`);
    });
    inRouter(<SkillsPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: '新建 Skill' }),
    );
    await userEvent.click(screen.getByRole('button', { name: '填链接' }));
    await userEvent.type(
      screen.getByPlaceholderText(/github.com\/owner\/repo/),
      'https://github.com/acme/skills',
    );
    await userEvent.click(screen.getByRole('button', { name: '读取' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('服务器连不上 github.com（连接超时）');
    expect(alert).toHaveTextContent('用“上传文件夹”导入');
    expect(
      within(alert).getByRole('link', { name: '去网络设置' }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(alert).getByRole('button', { name: '改用上传文件夹' }),
    );
    expect(screen.getByRole('button', { name: '上传文件夹' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

import { I18nRuntime } from '@nocobase/i18n';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  $t,
  $tj,
  $legacyText,
  connectLocale,
  setDictionary,
} from '../../client/i18n';
import locales from '../../client/locales';
import english from '../../shared/i18n/en.json';
import chinese from '../../shared/i18n/zh.json';
import legacyKeys from '../../shared/i18n/legacy-keys.json';
import { businessApiError } from '../../server/nocoreach/api-error';
import { systemMessageText } from '../../shared/i18n/messages';
import { nocobaseClient } from '../../client/lib/nocoreach-api';
import { vi } from 'vitest';

let disconnect: (() => void) | undefined;
afterEach(() => {
  disconnect?.();
  disconnect = undefined;
  cleanup();
  setDictionary(null);
  vi.unstubAllGlobals();
});

describe('semantic key migration contracts', () => {
  it.each(['zh-CN', 'en-US'])(
    'resolves every legacy alias to the exact current %s translation',
    (locale) => {
      setDictionary(locale === 'en-US' ? english : null);
      const values = locale === 'en-US' ? english : chinese;
      // The compatibility map grows with system messages. Check actual resolution,
      // including whitespace and empty values, rather than freezing the whole dictionary.
      for (const [alias, key] of Object.entries(legacyKeys)) {
        expect(values).toHaveProperty([key]);
        expect({ [alias]: $legacyText(alias) }).toEqual({
          [alias]: values[key as keyof typeof values],
        });
      }
    },
  );

  it.each(['zh-CN', 'en-US'])(
    'loads every semantic key through the real %s runtime',
    async (locale) => {
      const runtime = new I18nRuntime({
        defaultLocale: locale,
        locales: ['zh-CN', 'en-US'],
        applicationNamespace: 'nocoreach',
      });
      runtime.registerApplicationNamespace('nocoreach', locales);
      await runtime.init();
      disconnect = connectLocale(runtime);
      const values = locale === 'zh-CN' ? chinese : english;
      const t = runtime.getFixedT('nocoreach', locale);
      for (const [key, value] of Object.entries(values)) {
        expect($t(key)).toBe(value);
        expect(t(key)).toBe(value);
      }
    },
  );

  it('isolates retired aliases from current translation calls and preserves user interpolation', () => {
    setDictionary(english);
    expect($t('保存')).toBe('保存');
    expect($legacyText('保存')).toBe('Save');
    expect($legacyText('__proto__')).toBe('__proto__');
    expect($legacyText('Unknown upstream text')).toBe('Unknown upstream text');
    const userText = '保存。任务。';
    expect($t('dataHealth.retryScheduled', { 0: userText })).toBe(
      `The last sync failed and will retry automatically: ${userText}`,
    );
    expect($legacyText('上次同步失败，将自动重试：{0}', { 0: userText })).toBe(
      $t('dataHealth.retryScheduled', { 0: userText }),
    );
    render(
      <div>{$tj('dataHealth.retryScheduled', { 0: <b>{userText}</b> })}</div>,
    );
    expect(screen.getByText(userText).tagName).toBe('B');
    expect(
      systemMessageText('dataHealth.retryScheduled', { 0: userText }),
    ).toBe(`上次同步失败，将自动重试：${userText}`);
  });

  it('preserves historical rendered pattern messages', () => {
    setDictionary(english);
    expect($legacyText('全站搜索曝光上升 32%')).toBe(
      'Site-wide Search impressions up 32%',
    );
    setDictionary(null);
    expect($legacyText('全站搜索曝光上升 32%')).toBe('全站搜索曝光上升 32%');
  });

  it('preserves error contracts and re-renders semantic metadata after an English response', async () => {
    const runtime = new I18nRuntime({
      defaultLocale: 'en-US',
      locales: ['zh-CN', 'en-US'],
      applicationNamespace: 'nocoreach',
    });
    runtime.registerApplicationNamespace('nocoreach', locales);
    await runtime.init();
    disconnect = connectLocale(runtime);
    const payload = {
      error: businessApiError(
        403,
        'errors.networkUnavailable',
        'FIXTURE_DENIED',
        'en-US',
      ).toPayload(),
    };
    expect(payload.error).toMatchObject({
      code: 403,
      reason: 'FIXTURE_DENIED',
      message: '网络不可用',
      localizedMessage: {
        locale: 'en-US',
        message: english['errors.networkUnavailable'],
      },
      metadata: { ns: 'nocoreach', key: 'errors.networkUnavailable' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 403 })),
    );
    const error = await nocobaseClient
      .action('nrFixture', 'list')
      .catch((error: Error) => error);
    expect(error.message).toBe(english['errors.networkUnavailable']);
    await act(() => runtime.changeLanguage('zh-CN'));
    expect(error.message).toBe('网络不可用');
    expect(error.payload).toEqual(payload);
    expect(
      businessApiError(
        409,
        'Custom 自定义 error',
        undefined,
        'en-US',
      ).toPayload(),
    ).toMatchObject({
      message: 'Custom 自定义 error',
      localizedMessage: { message: 'Custom 自定义 error' },
    });
  });
});

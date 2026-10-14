import { describe, expect, it } from 'vitest';
import { formatTemplateVersion } from '../../client/lib/template-version';

describe('adopted template version', () => {
  it.each([
    ['1.2.3', 'v1.2.3'],
    ['1.0.0-beta.67', 'v1.0.0-beta.67'],
    ['v2.0.0-rc.1+build.12', 'v2.0.0-rc.1+build.12'],
    [' 1.0.0-beta.68 ', 'v1.0.0-beta.68'],
  ])('formats %s without a duplicate prefix', (input, expected) => {
    expect(formatTemplateVersion(input)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    123,
    {},
    '',
    '0.0.0',
    'v0.0.0',
    'latest',
    'vv1.2.3',
    '1.2',
    '01.2.3',
    '1.2.3-beta.01',
  ])('rejects missing or invalid metadata %j', (input) => {
    expect(formatTemplateVersion(input)).toBeUndefined();
  });
});

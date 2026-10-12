// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { apiErrorStatusCodes } from '@nocobase/app-server/router';
import { LegacyHttpError } from '../../server/nocoreach/legacy/context.js';

describe('classic HTTP error status boundary', () => {
  it.each(Object.entries(apiErrorStatusCodes))(
    'maps canonical %s to a failing HTTP %i',
    (status, expected) => {
      expect(new LegacyHttpError(status, 'Query failed').status).toBe(expected);
    },
  );

  it.each([400, 401, 403, 404, 409, 413, 429, 500, 502, 503, 504])(
    'preserves an explicit classic HTTP status %i',
    (status) => {
      const error = new LegacyHttpError(status, 'Query failed');
      expect(error.status).toBe(status);
      expect(error.message).toBe('Query failed');
    },
  );

  it.each([
    undefined,
    null,
    '400',
    'UNKNOWN_STATUS',
    'toString',
    200,
    302,
    0,
    600,
    400.5,
    NaN,
    Infinity,
  ])('fails closed for an invalid status %s', (status) => {
    expect(new LegacyHttpError(status, 'Query failed').status).toBe(500);
  });
});

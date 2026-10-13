import { ApiError, apiErrorStatusFromHttp } from '@nocobase/app-server/router';
import {
  systemMessageKey,
  systemMessageText,
} from '../../shared/i18n/messages.js';

export const businessApiError = (
  status: number,
  message: string,
  reason = `NOCOREACH_${status}`,
  locale = 'zh-CN',
) =>
  new ApiError({
    status: apiErrorStatusFromHttp(status),
    reason,
    domain: 'nocoreach',
    message: systemMessageText(message),
    localizedMessage: {
      locale,
      message: systemMessageText(message, {}, locale),
    },
    ...(systemMessageKey(message)
      ? { metadata: { ns: 'nocoreach', key: systemMessageKey(message) } }
      : {}),
    ...([400, 401, 403, 404, 409, 429, 500, 501, 503, 504].includes(status)
      ? {}
      : { httpStatus: status as 400 }),
  });

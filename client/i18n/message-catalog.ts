import { chinese, english, legacy } from 'virtual:nocoreach-startup-messages';

export const messages = { chinese, english, legacy, complete: false };
let pending: Promise<void> | undefined;

/** Resource loading only; no API, session or component state belongs here. */
export function loadBusinessMessages(): Promise<void> {
  if (messages.complete) return Promise.resolve();
  pending ??= Promise.all([
    import('../../shared/i18n/zh.json'),
    import('../../shared/i18n/en.json'),
    import('../../shared/i18n/legacy-keys.json'),
  ])
    .then(([zh, en, aliases]) => {
      messages.chinese = zh.default;
      messages.english = en.default;
      messages.legacy = aliases.default;
      messages.complete = true;
    })
    .catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
  return pending;
}

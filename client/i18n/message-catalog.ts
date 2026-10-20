import { chinese, english, legacy } from 'virtual:nocoreach-startup-messages';
import { recognizeSystemMessage } from '../../shared/i18n/recognize.js';
import type { MessageScope } from '../../shared/startup-pages.js';

export const messages = {
  chinese,
  english,
  legacy,
  complete: false,
  revision: 0,
};
const pending: Partial<Record<MessageScope, Promise<void>>> = {};
let remaining: Promise<void> | undefined;

type Catalog = {
  chinese: Record<string, string>;
  english: Record<string, string>;
  aliases: number[];
  legacy: Record<string, string>;
};

function merge(catalog: Catalog): void {
  const keys = Object.keys(catalog.chinese);
  const aliases = Object.fromEntries(
    catalog.aliases.map((index) => {
      const key = keys[index];
      return [catalog.chinese[key], key];
    }),
  );
  // The workspace contains every legacy pattern in canonical order. Keep that
  // ordering when merging shell or remaining copy: equal-length patterns use it.
  messages.chinese = { ...catalog.chinese, ...messages.chinese };
  messages.english = { ...catalog.english, ...messages.english };
  messages.legacy = { ...messages.legacy, ...aliases, ...catalog.legacy };
  messages.revision++;
}

/** Resource loading only; no API, session or component state belongs here. */
export function loadBusinessMessages(
  scope: MessageScope = 'all',
): Promise<void> {
  pending[scope] ??= (
    scope === 'workspace'
      ? import('virtual:nocoreach-business-messages/workspace').then(
          ({ default: catalog }) => merge(catalog),
        )
      : Promise.all([
          loadBusinessMessages('workspace'),
          (remaining ??= import('virtual:nocoreach-business-messages/remaining')
            .then(({ default: catalog }) => merge(catalog))
            .catch((error: unknown) => {
              remaining = undefined;
              throw error;
            })),
        ]).then(() => {
          messages.complete = true;
        })
  ).catch((error: unknown) => {
    delete pending[scope];
    throw error;
  });
  return pending[scope];
}

/** Exact compatibility lookup for system-owned values; never translate user data. */
export function systemMessageKey(value: string): string | undefined {
  return recognizeSystemMessage(value, messages.chinese, messages.legacy);
}

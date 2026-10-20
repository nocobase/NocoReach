import english from './en.json' with { type: 'json' };
import { recognizeSystemMessage } from './recognize.js';
import chinese from './zh.json' with { type: 'json' };
import legacyKeys from './legacy-keys.json' with { type: 'json' };

export type MessageKey = keyof typeof chinese;
export type MessageParams = Record<string | number, unknown>;
export interface SystemMessage {
  key: string;
  params?: MessageParams;
}

/** Compatibility is for old persisted system text, never for user-authored values. */
export function systemMessageKey(value: string): MessageKey | undefined {
  return recognizeSystemMessage(value, chinese, legacyKeys) as
    MessageKey | undefined;
}

const stringifyParameter = (value: unknown): string => String(value);

/** Keep the legacy Chinese display fields while emitting semantic presentation metadata. */
export function systemMessageText(
  key: string,
  params: MessageParams = {},
  locale = 'zh-CN',
): string {
  const resolved = systemMessageKey(key);
  const values = locale.toLowerCase().startsWith('zh') ? chinese : english;
  const template = resolved ? values[resolved] : key;
  return template.replace(/\{(\d+)\}/g, (slot, id: string) => {
    const value = params[id];
    if (value === undefined) return slot;
    if (value && typeof value === 'object') {
      if ('systemError' in value) return String(value.systemError);
      if ('key' in value) {
        const nested = value as SystemMessage;
        return systemMessageText(nested.key, nested.params, locale);
      }
    }
    return stringifyParameter(value);
  });
}

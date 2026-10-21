// Finds the server's sentence for a request that got no answer (shared/network-failures.ts) inside an error, in either
// language: alone, or behind the part that failed ("仓库：…", "Repository: …") as GitHub sync stores it.
import english from '../../shared/i18n/en.json';
import chinese from '../../shared/i18n/zh.json';
import {
  networkFailureEntries,
  type NetworkFailureReason,
} from '../../shared/network-failures';

/** Google sync and authorization report a request that got no answer by these codes alone. */
export const GOOGLE_NETWORK_CODES: readonly string[] = [
  'network_timeout',
  'network_unreachable',
];

export interface NetworkFailure {
  key: string;
  reason: NetworkFailureReason;
  proxied: boolean;
  host: string;
  /** Text around the sentence, as it was given. */
  before: string;
  after: string;
  /** Whether the sentence was the Chinese one the server writes. */
  chinese: boolean;
}

/** A host name or address, as `URL.hostname` gives it (a regular expression without groups). */
export const HOST_PATTERN = '(?:[A-Za-z0-9._\\-]+|\\[[0-9A-Fa-f:.]+\\])';
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let patterns:
  | {
      re: RegExp;
      entry: (typeof networkFailureEntries)[number];
      chinese: boolean;
    }[]
  | null = null;
const compile = () =>
  networkFailureEntries.flatMap((entry) =>
    (
      [
        [chinese, true],
        [english, false],
      ] as const
    ).map(([values, isChinese]) => ({
      re: new RegExp(
        escape(values[entry.key as keyof typeof values]).replace(
          '\\{0\\}',
          `(${HOST_PATTERN})`,
        ),
      ),
      entry,
      chinese: isChinese,
    })),
  );

export function findNetworkFailure(
  text: string | null | undefined,
): NetworkFailure | null {
  if (!text) return null;
  for (const { re, entry, chinese: isChinese } of (patterns ||= compile())) {
    const m = re.exec(text);
    if (m)
      return {
        ...entry,
        host: m[1],
        before: text.slice(0, m.index),
        after: text.slice(m.index + m[0].length),
        chinese: isChinese,
      };
  }
  return null;
}

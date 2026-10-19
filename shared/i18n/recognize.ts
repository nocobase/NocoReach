import { youtubeSystemErrors } from '../youtube-errors.js';

/** Recognize system-owned text only; callers retain their own locale resources. */
export function recognizeSystemMessage(
  value: string,
  chinese: Readonly<Record<string, string>>,
  aliases: Readonly<Record<string, string>>,
): string | undefined {
  if (Object.hasOwn(chinese, value)) return value;
  if (Object.hasOwn(aliases, value)) return aliases[value];
  return youtubeSystemErrors.find((key) => chinese[key] === value);
}

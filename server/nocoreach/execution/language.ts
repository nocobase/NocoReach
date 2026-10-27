// @ts-nocheck
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import * as __language from '../language.js';
import type { SupportedLocale } from '../../../shared/i18n/locales.js';
// The project language helpers (what language the AI writes in) live with the server code in server/language.js;
// this gives them types here. The same relative path works from the source and from dist/execution.
const shared = __language as {
  languageOf(project: unknown): SupportedLocale;
  forLanguage(prompt: string, language: string): string;
};
export const { languageOf, forLanguage } = shared;

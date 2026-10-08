// The project language helpers (what language the AI writes in) live with the server code in server/language.js;
// this gives them types here. The same relative path works from the source and from dist/execution.
const shared = require('../../server/language') as {
  languageOf(project: unknown): 'zh-CN' | 'en-US';
  forLanguage(prompt: string, language: string): string;
};
export const { languageOf, forLanguage } = shared;

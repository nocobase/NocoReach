// Which language a message is in (2026-10-07). Messages in this computer's terminal follow its system language; what the
// program writes to GitHub (PR title and body, comments) follows the project language sent with the run. What it reports
// to NocoReach stays in Chinese, because the Portal translates those for whoever is reading.
const locale = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || Intl.DateTimeFormat().resolvedOptions().locale || '';
export const chinese = /^zh/i.test(locale);
export const local = (zh: string, en: string) => (chinese ? zh : en);
export const forProject = (language: unknown, zh: string, en: string) => (language === 'en-US' ? en : zh);

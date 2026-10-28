import type { L } from './world/script/types.js';
import { t } from './world/script/types.js';

/** Authored fictional working papers, shared by briefs, deliveries and review conversations. */
export interface CaseStudy {
  audience: L;
  decision: L;
  evidence: L;
  document: L;
  checks: L;
  limitation: L;
  review: L;
  revision: L;
}

export type LocalCase = { [K in keyof CaseStudy]: string };

export function localCase(value: CaseStudy, language: string): LocalCase {
  const lang = language === 'en-US' ? 'en' : 'zh';
  return Object.fromEntries(
    (Object.keys(value) as (keyof CaseStudy)[]).map((key) => [
      key,
      value[key][lang],
    ]),
  ) as LocalCase;
}

/** A compact case still carries an authored decision matrix, not a repeated assignment. */
export function scenario(
  audience: L,
  decision: L,
  evidence: L,
  rows: readonly [L, L, L][],
  followup: L,
  limitation: L,
  review: L,
  revision: L,
): CaseStudy {
  const document = (lang: 'en' | 'zh') =>
    [
      lang === 'en'
        ? '## Working through the example'
        : '## 把场景拆成可以执行的决定',
      decision[lang],
      lang === 'en'
        ? '| Situation | Decision and action | What to verify |\n| --- | --- | --- |'
        : '| 情况 | 决定与动作 | 核对结果 |\n| --- | --- | --- |',
      rows
        .map((row) => `| ${row.map((cell) => cell[lang]).join(' | ')} |`)
        .join('\n'),
      lang === 'en'
        ? '## How to use this in the next review'
        : '## 下一次复核如何使用',
      followup[lang],
    ].join('\n\n');
  return {
    audience,
    decision,
    evidence,
    document: t(document('zh'), document('en')),
    checks: t(
      rows.map((r) => r[2].zh).join('；'),
      rows.map((r) => r[2].en).join('; '),
    ),
    limitation,
    review,
    revision,
  };
}

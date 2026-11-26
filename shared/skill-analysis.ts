/**
 * Skills in the daily analysis (2026-11-17): like a playbook step, an analysis scheme picks a few Skills, and every day
 * each reads the day's data by its method and proposes up to three opportunities, which the server checks and computes
 * the growth of (server/nocoreach/skill-analysis.ts). The numbers here are shared by the server and the pages that
 * estimate what a Skill adds.
 */
export const SKILL_ANALYSIS = {
  /** Skills a scheme can pick, as many as a playbook step names. */
  max: 5,
  /** Candidates one Skill may propose a day. */
  candidates: 3,
  /** The day's material given to each call, at most. */
  dataTokens: 10_000,
  /** The instructions around the Skill's method. */
  promptTokens: 1_500,
  /** What one call writes back, at most. */
  outputTokens: 2_000,
  /** How far back the Skills page counts what a Skill found. */
  recentDays: 30,
} as const;

/** The default scheme's Skills in a new or existing project, added once; a removal sticks. */
export const DEFAULT_ANALYSIS_SKILLS = [
  'content-strategy',
  'competitors',
  'ai-seo',
] as const;

/** A rough token count: about four characters a token for Latin text, one for each wider character such as CJK. */
export function approxTokens(text: string): number {
  let narrow = 0,
    wide = 0;
  for (const ch of text) {
    if ((ch.codePointAt(0) ?? 0) < 0x0250) narrow++;
    else wide++;
  }
  return Math.ceil(narrow / 4 + wide);
}

/** Input tokens a Skill adds in a month: its SKILL.md body with the day's material and the instructions, once a day. */
export function monthlySkillTokens(body: string): number {
  return (
    (approxTokens(body) +
      SKILL_ANALYSIS.dataTokens +
      SKILL_ANALYSIS.promptTokens) *
    30
  );
}

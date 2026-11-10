/**
 * Followed topics (2026-11-10 decision): one list in Project knowledge › Memory that every external source searches
 * besides the product name, so a source shows what people discuss in the market and not only what they say about us.
 * Shared by the server, which validates and searches, and the Memory page, which edits the list and shows its cost.
 */
export const TOPICS_MAX = 10;
export const TOPIC_MIN_LENGTH = 2;
export const TOPIC_MAX_LENGTH = 60;

/** A topic as written: single spaces, trimmed; null when it is not a usable search phrase. */
export function cleanTopic(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const topic = value.replace(/\s+/g, ' ').trim();
  if (
    topic.length < TOPIC_MIN_LENGTH ||
    topic.length > TOPIC_MAX_LENGTH ||
    // Sources put the topic between quotes in their searches.
    /["\\]/.test(topic) ||
    [...topic].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    return null;
  return topic;
}

/** Spellings of one topic counted once: case, spaces, hyphens and underscores do not matter (low-code, Low code). */
export const topicKey = (topic: string) =>
  topic.toLowerCase().replace(/[\s_-]+/g, '');

/** The topics without repeats, in their order. */
export function uniqueTopics(list: readonly string[]): string[] {
  const seen = new Set<string>(),
    out: string[] = [];
  for (const raw of list) {
    const topic = cleanTopic(raw);
    if (!topic || seen.has(topicKey(topic))) continue;
    seen.add(topicKey(topic));
    out.push(topic);
  }
  return out;
}

/**
 * What one topic costs on the project's DataForSEO connection, at DataForSEO's list prices (2026-11). The sources take
 * their own prices from here, so the estimate on the Memory page is what they spend. Hacker News and GitHub are free.
 */
export const TOPIC_PRICES = {
  /** Reddit: one Google search of site:reddit.com a week, two pages of results ($0.002 a page, ×5 for site:). */
  redditUsd: 0.02,
  /** YouTube: one search a week ($0.002), then the details of at most three newly found videos ($0.006 each). */
  youtubeSearchUsd: 0.002,
  youtubeVideoUsd: 0.006,
  youtubeVideos: 3,
  /** Trends: one Google Trends request a week. */
  trendsUsd: 0.011,
  /** AI questions: one lookup a month on each of ChatGPT and Google AI Overviews. */
  aiQuestionsUsd: 0.2,
  aiQuestionPlatforms: 2,
} as const;
export const WEEKS_PER_MONTH = 30 / 7;

/** Each paid source's monthly cost for one topic, and their sum. */
export function topicMonthlyCost() {
  const p = TOPIC_PRICES;
  const reddit = p.redditUsd * WEEKS_PER_MONTH,
    youtube =
      (p.youtubeSearchUsd + p.youtubeVideos * p.youtubeVideoUsd) *
      WEEKS_PER_MONTH,
    trends = p.trendsUsd * WEEKS_PER_MONTH,
    aiQuestions = p.aiQuestionsUsd * p.aiQuestionPlatforms;
  return {
    reddit,
    youtube,
    trends,
    aiQuestions,
    total: reddit + youtube + trends + aiQuestions,
  };
}

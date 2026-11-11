// @ts-nocheck
import { topicKey } from '../../shared/followed-topics.js';
import { TOPIC_SOURCES } from '../../shared/growth.js';
// Discussions a week on each followed topic (2026-11-10 step 2b): what Opportunities' trending topics are judged on,
// counted from what the sources already read for the topics, with no new paid query. Per whole week (Monday to Sunday):
// new Reddit threads and YouTube videos (by the day they were posted, among those found on the topic), Hacker News
// stories (Algolia's weekly count, hackernews-source.ts) and new GitHub repositories (GitHub hot topics' weekly count).
//
// A source counts from the week it started reading the topic (`since`): Hacker News and GitHub look back twelve weeks
// at once, Reddit and YouTube only see from their first search on, so a week before that has no count rather than 0.
// The counts are kept (nrSnapshots `topic-weeks:<id>`, 26 weeks) because Reddit and YouTube keep only their latest
// threads and videos: a week counted once keeps its count when its threads are no longer kept (the larger count wins).

const DAY = 86400000,
  KEEP_WEEKS = 26;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const addDays = (d, n) => iso(Date.parse(`${d}T00:00:00Z`) + n * DAY);
/** The Monday of a day's week. */
const weekOf = (d) => {
  const day = String(d).slice(0, 10),
    t = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(t.getTime())
    ? null
    : addDays(day, -((t.getUTCDay() + 6) % 7));
};
/** The Monday of the last whole week before `now`. */
const lastWholeWeek = (now) => addDays(weekOf(iso(now)), -7);
const earliest = (...days) => days.filter(Boolean).sort()[0] || null;
const onTopic = (item, key) =>
  (item?.topics || []).some((t) => topicKey(t) === key);
const pick = (o, key) =>
  o?.[Object.keys(o || {}).find((k) => topicKey(k) === key)];

/** Weekly counts from items found on a topic, by the day each was posted (or first found). */
function countItems(items, key, dayOf, until) {
  const out = {};
  for (const item of items || []) {
    if (!onTopic(item, key)) continue;
    const week = weekOf(dayOf(item) || '');
    if (!week || week > until) continue;
    out[week] = (out[week] || 0) + 1;
  }
  return out;
}

/**
 * The topics' weekly counts after a new read of the sources: `stored` is the last tally. Only the topics followed now are
 * kept, each with at most KEEP_WEEKS weeks up to the last whole week.
 */
function tally({ topics, rd, hn, yt, ght, stored, now }) {
  const until = lastWholeWeek(now),
    out = {};
  for (const name of topics || []) {
    const key = topicKey(name),
      prev = stored?.topics?.[key] || { since: {}, weeks: {} },
      since = { ...(prev.since || {}) },
      weeks = Object.fromEntries(
        Object.entries(prev.weeks || {}).map(([w, c]) => [w, { ...c }]),
      ),
      put = (source, week, value, keepLarger) => {
        if (week > until || value === null || value === undefined) return;
        const row = (weeks[week] ||= {});
        row[source] = keepLarger ? Math.max(row[source] || 0, value) : value;
      };
    // Reddit: from the week of the topic's first thread found on, as found by the weekly searches.
    const threads = Object.values(rd?.topicPosts || {}).filter((p) =>
      onTopic(p, key),
    );
    since.reddit = earliest(
      since.reddit,
      weekOf(threads.map((p) => p.firstSeenAt).sort()[0] || ''),
    );
    if (since.reddit)
      for (const [week, c] of Object.entries(
        countItems(threads, key, (p) => p.postedAt || p.firstSeenAt, until),
      ))
        if (week >= since.reddit) put('reddit', week, c, true);
    // Hacker News: Algolia's count for each week read.
    const hnWeeks = pick(hn?.topicWeeks, key) || {};
    for (const [week, c] of Object.entries(hnWeeks))
      if (Number.isFinite(c)) put('hackernews', week, c, false);
    since.hackernews = earliest(
      since.hackernews,
      Object.keys(hnWeeks).sort()[0],
    );
    // YouTube: videos published from the week of the topic's first video found on.
    const videos = Object.values(yt?.topicVideos || {}).filter((v) =>
      onTopic(v, key),
    );
    since.youtube = earliest(
      since.youtube,
      weekOf(videos.map((v) => v.firstSeenAt).sort()[0] || ''),
    );
    if (since.youtube)
      for (const [week, c] of Object.entries(
        countItems(videos, key, (v) => v.publishedAt || v.firstSeenAt, until),
      ))
        if (week >= since.youtube) put('youtube', week, c, true);
    // GitHub: new repositories under the topic, as GitHub hot topics counts them.
    const ghWeeks = pick(ght?.weekly, key) || {},
      counted = Object.entries(ghWeeks).filter(([, c]) => Number.isFinite(c));
    for (const [week, c] of counted) put('github', week, c, false);
    since.github = earliest(since.github, counted.map(([w]) => w).sort()[0]);
    for (const s of TOPIC_SOURCES) if (!since[s]) delete since[s];
    out[key] = {
      name,
      since,
      weeks: Object.fromEntries(
        Object.entries(weeks)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-KEEP_WEEKS),
      ),
    };
  }
  return { updatedAt: new Date(now).toISOString(), until, topics: out };
}

/**
 * A topic's last `count` whole weeks for the chart, oldest first: each source's count from the week it covers the topic,
 * 0 for a covered week with nothing posted.
 */
function chartWeeks(entry, until, count = 8) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const week = addDays(until, -7 * i),
      counts = {};
    for (const s of TOPIC_SOURCES)
      if (entry?.since?.[s] && entry.since[s] <= week)
        counts[s] = entry.weeks?.[week]?.[s] ?? 0;
    out.push({ week, counts });
  }
  return out;
}

class TopicWeeks {
  constructor(p) {
    this.p = p;
  }
  repo() {
    return this.p.db.getRepository('nrSnapshots');
  }
  key(id) {
    return `topic-weeks:${id}`;
  }
  async state(id) {
    return (
      (await this.repo().findOne({ filter: { key: this.key(id) } }))?.get(
        'payload',
      ) || null
    );
  }
  /** Counts the followed topics again from the sources' saved state and keeps the result. */
  async update(id, { topics, rd, hn, yt, ght, now }) {
    const row = await this.repo().findOne({ filter: { key: this.key(id) } }),
      payload = tally({
        topics,
        rd,
        hn,
        yt,
        ght,
        now,
        stored: row?.get('payload') || null,
      });
    if (row)
      await this.repo().update({ filterByTk: row.id, values: { payload } });
    else await this.repo().create({ values: { key: this.key(id), payload } });
    return payload;
  }
}

export { TopicWeeks, tally, chartWeeks, weekOf, lastWholeWeek, addDays };

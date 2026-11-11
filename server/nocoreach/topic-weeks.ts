// @ts-nocheck
import { topicKey } from '../../shared/followed-topics.js';
import { TOPIC_SOURCES } from '../../shared/growth.js';
// Discussions a week on each followed topic (2026-11-10 step 2b): what Opportunities' trending topics are judged on,
// counted from what the sources already read for the topics, with no new paid query. Per whole week (Monday to Sunday):
// new Reddit threads and YouTube videos (by the day they were posted, among those found on the topic), Hacker News
// stories (Algolia's weekly count, hackernews-source.ts) and new GitHub repositories (GitHub hot topics' weekly count).
//
// A week has a count for a source only when the source read that week; a week it did not read has none, never 0, so
// a source that starts reading (or misses a week) is not taken for a sudden rise. Hacker News and GitHub count the
// last twelve weeks at once by date, and fill a week they missed on their next read. Reddit (Google's past week) and
// YouTube (DataForSEO, no date filter) cannot look back: the search made in a week reads the week before it, so they
// build up from their first search on and a week whose search failed stays without a count. 0 is a week read with
// nothing found. `failed` is, per source, when its latest read of the topic failed, as the source keeps it until a
// read succeeds (Reddit's topicChecks, YouTube's topicMisses, Hacker News' topicCountFailed, GitHub's topicFailed), so
// "not read yet" and "the read failed" are told apart (coverage()).
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
const onTopic = (item, key) =>
  (item?.topics || []).some((t) => topicKey(t) === key);
const pick = (o, key) =>
  o?.[Object.keys(o || {}).find((k) => topicKey(k) === key)];

/** Weekly counts from items found on a topic, by the day each was posted (or first found). */
function countItems(items, key, dayOf) {
  const out = {};
  for (const item of items || []) {
    if (!onTopic(item, key)) continue;
    const week = weekOf(dayOf(item) || '');
    if (week) out[week] = (out[week] || 0) + 1;
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
      prev = stored?.topics?.[key] || { weeks: {} },
      failed = {},
      weeks = Object.fromEntries(
        Object.entries(prev.weeks || {}).map(([w, c]) => [w, { ...c }]),
      ),
      put = (source, week, value, keepLarger) => {
        if (week > until || !Number.isFinite(value)) return;
        const row = (weeks[week] ||= {});
        row[source] = keepLarger ? Math.max(row[source] ?? 0, value) : value;
      },
      fail = (source, at) => {
        if (at) failed[source] = at;
      };
    // Reddit and YouTube: the week before the one their latest weekly search ran in, and every week read before, counted
    // again from the threads and videos kept (a thread found later still counts in the week it was posted).
    const fromSearches = (source, items, readWeek, dayOf) => {
      if (readWeek) put(source, readWeek, 0, true);
      const counts = countItems(items, key, dayOf);
      for (const [week, row] of Object.entries(weeks))
        if (row[source] !== undefined)
          put(source, week, counts[week] || 0, true);
    };
    const check = pick(rd?.topicChecks, key),
      redditRead =
        check?.status === 'completed' && check.week
          ? addDays(check.week, -7)
          : null;
    fromSearches(
      'reddit',
      Object.values(rd?.topicPosts || {}),
      redditRead,
      (p) => p.postedAt || p.firstSeenAt,
    );
    fail('reddit', check?.status === 'attention' ? check.at : null);
    const ytAt = pick(yt?.topicReads, key) || null;
    fromSearches(
      'youtube',
      Object.values(yt?.topicVideos || {}),
      ytAt ? addDays(weekOf(ytAt), -7) : null,
      (v) => v.publishedAt || v.firstSeenAt,
    );
    fail('youtube', pick(yt?.topicMisses, key));
    // Hacker News and GitHub: their count for each week read; a week they could not count has none.
    const hnWeeks = pick(hn?.topicWeeks, key) || {};
    for (const [week, c] of Object.entries(hnWeeks))
      put('hackernews', week, c, false);
    fail('hackernews', pick(hn?.topicCountFailed, key));
    for (const [week, c] of Object.entries(pick(ght?.weekly, key) || {}))
      put('github', week, c, false);
    fail('github', pick(ght?.topicFailed, key));
    out[key] = {
      name,
      weeks: Object.fromEntries(
        Object.entries(weeks)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-KEEP_WEEKS),
      ),
      ...(Object.keys(failed).length ? { failed } : {}),
    };
  }
  return { updatedAt: new Date(now).toISOString(), until, topics: out };
}

/**
 * A topic's last `count` whole weeks for the chart, oldest first: each source's count for the weeks it read, none for
 * a week it did not.
 */
function chartWeeks(entry, until, count = 8) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const week = addDays(until, -7 * i),
      counts = {};
    for (const s of TOPIC_SOURCES) {
      const c = entry?.weeks?.[week]?.[s];
      if (Number.isFinite(c)) counts[s] = c;
    }
    out.push({ week, counts });
  }
  return out;
}

/**
 * How much of the last `count` weeks each source has read for a topic: `weeks` read, and whether its latest read
 * failed. A source with no week read and no failure has not read the topic yet.
 */
function coverage(entry, until, count = 8) {
  const weeks = chartWeeks(entry, until, count),
    out = {};
  for (const s of TOPIC_SOURCES)
    out[s] = {
      weeks: weeks.filter((w) => w.counts[s] !== undefined).length,
      failed: Boolean(entry?.failed?.[s]),
    };
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

export {
  TopicWeeks,
  tally,
  chartWeeks,
  coverage,
  weekOf,
  lastWholeWeek,
  addDays,
};

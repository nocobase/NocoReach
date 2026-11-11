// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
import { topicKey } from '../../shared/followed-topics.js';
import { TOPIC_SOURCES } from '../../shared/growth.js';
import { kit } from './growth-signals.js';
import { chartWeeks, weekOf } from './topic-weeks.js';
import { occurrences } from './hackernews-source.js';
// Trending topics and what people keep asking (2026-11-10 step 2b): growth points read from what the followed topics'
// sources already found (Reddit threads, Hacker News stories, YouTube videos, GitHub repositories), the weekly counts
// (topic-weeks.ts) and the weekly AI reading of their titles (topic-discovery.ts). Like growth-signals.ts, every
// function reads saved state only; the numbers are counted here and the model never writes them.
//
// - topic-rise: a followed topic discussed clearly more in the last 4 weeks than the 4 before, on at least two sources.
//   A rise on one source alone waits in Watching (watchOnly) until another source follows.
// - new-topic: a phrase the AI found more and more often in the topics' discussions, not followed yet.
// - topic-hot: this week's hottest Hacker News stories (points, comments, products named in the comments) and Reddit
//   threads (Google's order among the week's threads, products named in what Google shows). Reddit's votes and comment
//   counts are not known, so none are shown.
// - asked-often: a question asked again and again in the forum and the topics' Reddit and Hacker News posts that no page
//   of the site answers.
// - youtube-hot: a video on a topic with many views in the last 30 days.

const { text, figure, col, table, growth, signal, n, sum, strengthOf } = kit;
const DAY = 86400000;
const NAME = {
  reddit: 'Reddit',
  hackernews: 'Hacker News',
  youtube: 'YouTube',
  github: 'GitHub',
};
const LINK = {
  reddit: '/data/reddit?group=topics',
  hackernews: '/data/hackernews?group=topics',
  youtube: '/data/youtube?group=topics',
  github: '/data/github?view=hot',
};
// A source rises with at least this many discussions in the last 4 weeks, so 0 → 1 is no rise.
const MIN_SOURCE = 3;
const day = (v) => (typeof v === 'string' && v ? v.slice(0, 10) : null);
const mean = (list) =>
  list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
const onTopic = (item, key) =>
  (item?.topics || []).some((t) => topicKey(t) === key);
const holds = (item, terms) => {
  const s = `${item?.title || ''} ${item?.snippet || ''}`.toLowerCase();
  return terms.some((t) => s.includes(t));
};

/**
 * Whether a topic is rising over eight whole weeks: each source counted from the week it covers the whole window, the
 * last four weeks against the four before (rise `risePct`, at least `minDiscussions` in all), and the sources that rose.
 */
function judge(weeks, since, V, rule) {
  const start = weeks[0]?.week,
    rise = 1 + V(rule, 'risePct') / 100,
    judged = TOPIC_SOURCES.filter((s) => since?.[s] && since[s] <= start),
    per = judged.map((s) => {
      const prev = sum(weeks.slice(0, 4), (w) => w.counts[s]),
        last = sum(weeks.slice(4), (w) => w.counts[s]);
      return {
        source: s,
        prev,
        last,
        rising: last >= MIN_SOURCE && last > prev && last >= prev * rise,
      };
    }),
    prev = sum(per, (x) => x.prev),
    last = sum(per, (x) => x.last);
  return {
    judged,
    prev,
    last,
    rising: per.filter((x) => x.rising).map((x) => x.source),
    top: [...per].sort((a, b) => b.last - a.last)[0]?.source || null,
    up: last >= V(rule, 'minDiscussions') && last > prev && last >= prev * rise,
  };
}

/** Google's interest in a followed topic over the last 3 months against the 3 before (Trends' weekly points). */
function googleChange(tr, key) {
  const k = (tr?.keywords || []).find((x) => topicKey(x.keyword) === key),
    vals = (k?.latest?.points || [])
      .map((p) => p.value)
      .filter((v) => Number.isFinite(v));
  if (vals.length < 26) return null;
  const now = mean(vals.slice(-13)),
    before = mean(vals.slice(-26, -13));
  return before > 0 ? (now - before) / before : null;
}

/** The top 10 for a topic (growth-sources.ts reads it for rising topics): the results whose title names it. */
function dedicated(serps, name) {
  const r = serps?.[topicKey(name)];
  if (!r?.items) return null;
  const k = name.toLowerCase(),
    hits = r.items.filter((i) =>
      String(i.title || '')
        .toLowerCase()
        .includes(k),
    );
  return {
    count: hits.length,
    domains: hits.map((i) => i.domain).filter(Boolean),
  };
}

const DISCUSSION_COLUMNS = [
  col('discussion'),
  col('source'),
  col('heat', 'message'),
  col('date', 'date'),
];
/** The discussions of a window found on the sources, newest first; `match` says which are about the topic. */
function discussionRows({ match, from, rd, hn, yt, ght, key, repos = [] }) {
  const rows = [];
  for (const p of Object.values(rd?.topicPosts || {})) {
    const d = day(p.postedAt) || day(p.firstSeenAt);
    if (!d || d < from || !match(p)) continue;
    const rank = key ? p.ranks?.[key]?.rank : null;
    rows.push({
      discussion: p.title,
      source: p.subreddit ? `Reddit · r/${p.subreddit}` : 'Reddit',
      heat: rank ? text('growth.value.googleRank', { 0: rank }) : null,
      date: d,
      url: p.url,
    });
  }
  for (const s of Object.values(hn?.topicStories || {})) {
    const d = day(s.createdAt);
    if (!d || d < from || !match(s)) continue;
    rows.push({
      discussion: s.title,
      source: 'Hacker News',
      heat: text('growth.value.pointsComments', {
        0: n(s.points),
        1: n(s.comments),
      }),
      date: d,
      url: s.hnUrl,
    });
  }
  for (const v of Object.values(yt?.topicVideos || {})) {
    const d = day(v.publishedAt) || day(v.firstSeenAt);
    if (!d || d < from || !match(v)) continue;
    rows.push({
      discussion: v.title,
      source: v.channel ? `YouTube · ${v.channel}` : 'YouTube',
      heat:
        v.views === null || v.views === undefined
          ? null
          : text('growth.value.views', { 0: n(v.views) }),
      date: d,
      url: v.url,
    });
  }
  for (const r of repos) {
    const x = ght?.repos?.[r] || {},
      d = day(x.createdAt);
    if (!d || d < from) continue;
    const samples = ght?.stars?.[r] || {},
      stars = samples[Object.keys(samples).sort().at(-1)] ?? x.stars ?? null;
    rows.push({
      discussion: x.description ? `${r}: ${x.description}`.slice(0, 200) : r,
      source: 'GitHub',
      heat: stars === null ? null : text('growth.value.stars', { 0: n(stars) }),
      date: d,
      url: x.url || `https://github.com/${r}`,
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

/** The growth of a rising topic: how many discussions, on how many sources, Google's interest and the top 10. */
function riseGrowth({ kind, j, weeks, rows, topic, tr, volumes, serps, link }) {
  const change = topic.followed ? googleChange(tr, topicKey(topic.name)) : null,
    volume = volumes?.get?.(topic.name.toLowerCase()) ?? null,
    top = dedicated(serps, topic.name);
  return {
    ...growth(
      kind,
      [
        figure('discussions4w', j.last, {
          detail: text('growth.detail.before4w', { 0: n(j.prev) }),
        }),
        figure('risingSources', j.rising.length, {
          detail: text('growth.detail.list', {
            0: j.rising.map((s) => NAME[s]).join(' · ') || '—',
          }),
        }),
        change !== null
          ? figure('googleSearch3m', change, {
              format: 'change',
              ...(volume
                ? {
                    detail: text('growth.detail.monthlyNow', { 0: n(volume) }),
                  }
                : {}),
            })
          : volume
            ? figure('monthlySearches', volume)
            : null,
        top
          ? figure('dedicatedTop10', top.count, {
              ...(top.domains.length
                ? {
                    detail: text('growth.detail.list', {
                      0: top.domains.slice(0, 2).join(' · '),
                    }),
                  }
                : {}),
            })
          : null,
      ],
      table(DISCUSSION_COLUMNS, rows, 'discussions', link),
    ),
    weeks,
    topic,
  };
}

/** Followed topics discussed clearly more in the last four weeks; a rise on one source alone is watched. */
function topicRiseSignals({ tw, rd, hn, yt, ght, tr, volumes, serps, V }) {
  if (!tw?.topics || !tw.until) return [];
  const out = [];
  for (const [key, entry] of Object.entries(tw.topics)) {
    const weeks = chartWeeks(entry, tw.until, 8),
      j = judge(weeks, entry.since, V, 'topic-rise');
    if (!j.up || !j.rising.length) continue;
    const watchOnly = j.rising.length < V('topic-rise', 'minSources'),
      rows = discussionRows({
        match: (x) => onTopic(x, key),
        from: weeks[4].week,
        rd,
        hn,
        yt,
        ght,
        key,
        repos: ght?.topicNew?.[entry.name] || [],
      }),
      ratio = j.prev ? j.last / j.prev : null;
    out.push(
      signal({
        key: `topic-rise:${key}`,
        type: 'timing',
        source: 'topics',
        title: systemMessageText(
          ratio
            ? 'growthSignals.topicRiseTitle'
            : 'growthSignals.topicRiseNewTitle',
          { 0: entry.name, 1: ratio ? ratio.toFixed(1) : n(j.last) },
        ),
        chip: { tone: 'green', text: `${n(j.prev)} → ${n(j.last)}` },
        facts: [
          systemMessageText('growthSignals.topicRiseFacts', {
            0: n(j.last),
            1: n(j.prev),
            2: j.rising.map((s) => NAME[s]).join('、'),
          }),
          ...(rows.length ? [kit.examples(rows.map((r) => r.discussion))] : []),
        ],
        strength: Math.max(1, strengthOf(j.last * 20) - (watchOnly ? 20 : 0)),
        action: 'create',
        actionable: !watchOnly,
        ...(watchOnly
          ? {
              watchOnly: true,
              waitingFor: systemMessageText('growthSignals.topicRiseWaiting'),
            }
          : {}),
        growth: riseGrowth({
          kind: 'topic-rise',
          j,
          weeks,
          rows,
          topic: { name: entry.name, followed: true },
          tr,
          volumes,
          serps,
          link: LINK[j.top] || LINK.reddit,
        }),
      }),
    );
  }
  return out;
}

/**
 * New topics: phrases the AI found in the followed topics' discussions (topic-discovery.ts), counted per week over
 * the same discussions (and Hacker News' own weekly count of the phrase), rising as a followed topic must.
 */
function newTopicSignals({
  td,
  tw,
  rd,
  hn,
  yt,
  ght,
  volumes,
  serps,
  followed,
  V,
}) {
  if (!td?.newTopics?.length || !tw?.until) return [];
  const taken = new Set((followed || []).map(topicKey)),
    out = [];
  for (const t of td.newTopics) {
    const key = topicKey(t.phrase);
    if (!key || taken.has(key)) continue;
    const terms = (t.terms || []).map((x) => String(x).toLowerCase()),
      fromKey = topicKey(t.from || ''),
      cover = tw.topics?.[fromKey]?.since || {},
      since = {},
      counts = {};
    const count = (source, items, dayOf) => {
      for (const item of items) {
        if (!holds(item, terms)) continue;
        const d = dayOf(item);
        if (!d) continue;
        const w = weekOf(d);
        (counts[w] ||= {})[source] = (counts[w][source] || 0) + 1;
      }
    };
    if (cover.reddit) {
      since.reddit = cover.reddit;
      count(
        'reddit',
        Object.values(rd?.topicPosts || {}),
        (p) => day(p.postedAt) || day(p.firstSeenAt),
      );
    }
    if (cover.youtube) {
      since.youtube = cover.youtube;
      count(
        'youtube',
        Object.values(yt?.topicVideos || {}),
        (v) => day(v.publishedAt) || day(v.firstSeenAt),
      );
    }
    const hnWeeks = Object.entries(t.hnWeeks || {}).filter(([, c]) =>
      Number.isFinite(c),
    );
    if (hnWeeks.length) {
      since.hackernews = hnWeeks.map(([w]) => w).sort()[0];
      for (const [w, c] of hnWeeks) (counts[w] ||= {}).hackernews = c;
    }
    const weeks = chartWeeks({ since, weeks: counts }, tw.until, 8),
      j = judge(weeks, since, V, 'topic-new');
    if (!j.up || !j.rising.length) continue;
    const rows = discussionRows({
        match: (x) => holds(x, terms),
        from: weeks[4].week,
        rd,
        hn,
        yt,
        ght,
      }),
      ratio = j.prev ? j.last / j.prev : null;
    out.push(
      signal({
        key: `new-topic:${key}`,
        type: 'timing',
        source: 'topics',
        title: systemMessageText(
          ratio
            ? 'growthSignals.newTopicTitle'
            : 'growthSignals.newTopicNewTitle',
          { 0: t.phrase, 1: ratio ? ratio.toFixed(1) : n(j.last) },
        ),
        chip: { tone: 'green', text: `${n(j.prev)} → ${n(j.last)}` },
        facts: [
          systemMessageText('growthSignals.newTopicFacts', {
            0: t.from || '—',
            1: n(j.last),
            2: n(j.prev),
          }),
          ...(t.reason ? [t.reason] : []),
          ...(rows.length ? [kit.examples(rows.map((r) => r.discussion))] : []),
        ],
        strength: strengthOf(j.last * 20),
        action: 'create',
        growth: riseGrowth({
          kind: 'new-topic',
          j,
          weeks,
          rows,
          topic: { name: t.phrase, from: t.from || undefined, followed: false },
          volumes,
          serps,
          link: LINK[j.top] || LINK.hackernews,
        }),
      }),
    );
  }
  return out.slice(0, 3);
}

/** The products named in a text: the project's and each competitor's name, how many times each (as in comments). */
function named(textOf, names) {
  return names
    .map((x) => ({ ...x, mentions: occurrences(textOf, x.name) }))
    .filter((x) => x.mentions);
}
const namedText = (list) =>
  list
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 3)
    .map((x) => `${x.name} ${x.mentions}`)
    .join(' · ');

/**
 * This week's hottest discussions on the followed topics: Hacker News stories with many points, and the Reddit threads
 * Google puts first among the week's threads on a topic. At most two from each, three in all.
 */
function hotDiscussionSignals({ rd, hn, followed, names, now, V }) {
  const since = new Date(now - 7 * DAY).toISOString(),
    keys = new Map((followed || []).map((t) => [topicKey(t), t])),
    out = [];
  const stories = Object.values(hn?.topicStories || {})
    .filter(
      (s) => s.createdAt >= since && s.points >= V('topic-hot', 'minPoints'),
    )
    .sort((a, b) => b.points + b.comments - (a.points + a.comments))
    .slice(0, 2);
  for (const s of stories) {
    const topic =
        (s.topics || []).find((t) => keys.has(topicKey(t))) ||
        s.topics?.[0] ||
        '',
      inComments = (s.named || []).filter((x) => x.mentions > 0),
      own = (s.named || []).find((x) => x.own);
    out.push(
      signal({
        key: `topic-hot:hackernews:${s.id}`,
        type: 'timing',
        source: 'hackernews',
        url: s.hnUrl,
        title: systemMessageText('growthSignals.hotStoryTitle', {
          0: topic,
          1: s.title,
        }),
        chip: { tone: 'violet', text: `${n(s.points)} · ${n(s.comments)}` },
        facts: [
          systemMessageText('growthSignals.hotStoryFacts', {
            0: n(s.points),
            1: n(s.comments),
            2: day(s.createdAt),
          }),
          ...(s.commentsRead
            ? [
                systemMessageText('growthSignals.namedInComments', {
                  0: n(s.commentsRead),
                  1: namedText([...inComments]) || '—',
                }),
              ]
            : []),
          ...(s.excerpts || []).slice(0, 2).map((e) => e.text),
        ],
        strength: strengthOf(s.points + s.comments * 2),
        action: 'reply',
        growth: {
          ...growth(
            'hot-discussion',
            [
              figure('points', s.points),
              figure('comments', s.comments),
              s.commentsRead
                ? figure('namedInComments', namedText([...inComments]) || '—', {
                    ...(own
                      ? {
                          detail: text('growth.detail.ownMentions', {
                            0: own.name,
                            1: n(own.mentions),
                          }),
                        }
                      : {}),
                  })
                : null,
              figure('posted', day(s.createdAt), { format: 'date' }),
            ],
            (s.excerpts || []).length
              ? table(
                  [col('comment'), col('named', 'list')],
                  s.excerpts.map((e) => ({
                    comment: e.text,
                    named: e.names,
                    url: s.hnUrl,
                  })),
                  'comments',
                  s.hnUrl,
                )
              : undefined,
          ),
          topic: { name: topic, followed: true },
        },
      }),
    );
  }
  // Reddit: this week's search of each topic, the threads Google ranks first among them.
  const threads = [];
  for (const p of Object.values(rd?.topicPosts || {}))
    for (const [key, r] of Object.entries(p.ranks || {})) {
      const check = rd?.topicChecks?.[key];
      if (!keys.has(key) || !check || r.week !== check.week) continue;
      const posted = day(p.postedAt) || day(p.firstSeenAt);
      if (
        !posted ||
        posted < since.slice(0, 10) ||
        r.rank > V('topic-hot', 'maxRank')
      )
        continue;
      threads.push({ ...p, topic: keys.get(key), key, rank: r.rank, posted });
    }
  const seen = new Set();
  for (const p of threads.sort(
    (a, b) => a.rank - b.rank || b.posted.localeCompare(a.posted),
  )) {
    if (seen.has(p.id) || seen.size >= 2 || out.length >= 3) continue;
    seen.add(p.id);
    const week = Object.values(rd.topicPosts).filter(
        (x) => x.ranks?.[p.key]?.week === p.ranks[p.key].week,
      ),
      mentioned = named(`${p.title} ${p.snippet || ''}`, names || []);
    out.push(
      signal({
        key: `topic-hot:reddit:${p.id}`,
        type: 'timing',
        source: 'reddit',
        url: p.url,
        title: systemMessageText('growthSignals.hotThreadTitle', {
          0: p.subreddit ? `r/${p.subreddit}` : 'Reddit',
          1: p.title,
        }),
        chip: { tone: 'violet', text: `Google #${p.rank}` },
        facts: [
          systemMessageText('growthSignals.hotThreadFacts', {
            0: p.topic,
            1: p.rank,
            2: week.length,
            3: p.posted,
          }),
          ...(p.snippet ? [p.snippet] : []),
          systemMessageText('growthSignals.redditNoVotes'),
        ],
        strength: Math.max(1, 70 - p.rank * 8),
        action: 'reply',
        growth: {
          ...growth(
            'hot-discussion',
            [
              figure('googlePosition', p.rank, {
                format: 'position',
                detail: text('growth.detail.ofWeekThreads', { 0: week.length }),
              }),
              figure('posted', p.posted, { format: 'date' }),
              figure('subreddit', p.subreddit ? `r/${p.subreddit}` : '—'),
              mentioned.length
                ? figure('namedOnGoogle', namedText(mentioned))
                : null,
            ],
            table(
              [
                col('discussion'),
                col('position', 'position'),
                col('date', 'date'),
              ],
              week
                .map((x) => ({
                  discussion: x.title,
                  position: x.ranks[p.key].rank,
                  date: day(x.postedAt) || day(x.firstSeenAt),
                  url: x.url,
                }))
                .sort((a, b) => a.position - b.position),
              'discussions',
              LINK.reddit,
            ),
          ),
          topic: { name: p.topic, followed: true },
        },
      }),
    );
  }
  return out;
}

/** Words of a text for matching a question with a page: Latin words of 3+ letters and CJK pairs, minus common words. */
const STOP = new Set(
  'the and for with how what why when where which who can does are not you your our from that this into about use using get set have has more than any all'.split(
    ' ',
  ),
);
function words(s) {
  const t = String(s || '').toLowerCase(),
    out = new Set();
  for (const w of t.match(/[a-z][a-z0-9-]{2,}/g) || [])
    if (!STOP.has(w)) out.add(w);
  for (const run of t.match(/[一-鿿]{2,}/g) || [])
    for (let i = 0; i < run.length - 1; i++) out.add(run.slice(i, i + 2));
  return out;
}
/** A page answering a question: its title and address hold most of the question's words (three in four). */
function answeredBy(pages, query) {
  const q = [...words(query)];
  if (!q.length) return null;
  const need = Math.max(1, Math.ceil(q.length * 0.75));
  return (
    (pages || []).find((p) => {
      const w = words(
        `${p.title || ''} ${decodeURIComponent(String(p.url || '')).replace(/[-_/]+/g, ' ')}`,
      );
      return q.filter((x) => w.has(x)).length >= need;
    }) || null
  );
}

/**
 * Questions asked again and again (topic-discovery.ts groups them): forum topics of the last 30 days and the followed
 * topics' Reddit threads and Hacker News stories. One with enough posts and no page of the site answering it.
 */
function askedOftenSignals({ td, cm, rd, hn, site, now, V }) {
  if (!td?.questions?.length) return [];
  const since = new Date(now - 30 * DAY).toISOString().slice(0, 10),
    items = new Map();
  for (const t of Object.values(cm?.topics || {}))
    if (day(t.createdAt) >= since)
      items.set(`forum:${t.id}`, {
        question: t.title,
        source: 'forum',
        date: day(t.createdAt),
        views: t.views || 0,
        solved: Boolean(t.solved),
        url: cm.origin ? `${cm.origin}/t/${t.slug}/${t.id}` : null,
      });
  for (const p of Object.values(rd?.topicPosts || {})) {
    const d = day(p.postedAt) || day(p.firstSeenAt);
    if (d >= since)
      items.set(`reddit:${p.id}`, {
        question: p.title,
        source: 'reddit',
        date: d,
        url: p.url,
      });
  }
  for (const s of Object.values(hn?.topicStories || {}))
    if (day(s.createdAt) >= since)
      items.set(`hackernews:${s.id}`, {
        question: s.title,
        source: 'hackernews',
        date: day(s.createdAt),
        url: s.hnUrl,
      });
  const out = [];
  for (const q of td.questions) {
    const rows = [...new Set(q.ids || [])]
      .map((i) => items.get(i))
      .filter(Boolean);
    if (rows.length < V('asked-often', 'minQuestions')) continue;
    if (answeredBy(site?.pages, q.query || q.theme)) continue;
    const forum = rows.filter((r) => r.source === 'forum').length,
      split = text('growth.detail.askedSplit', {
        0: forum,
        1: rows.length - forum,
      }),
      views = sum(rows, (r) => r.views);
    rows.sort((a, b) => b.date.localeCompare(a.date));
    out.push(
      signal({
        key: `asked-often:${topicKey(q.theme).slice(0, 80)}`,
        type: 'gap',
        source: 'topics',
        title: systemMessageText('growthSignals.askedOftenTitle', {
          0: q.theme,
          1: rows.length,
        }),
        chip: {
          tone: 'amber',
          text: systemMessageText('growthSignals.questionsChip', {
            0: rows.length,
          }),
        },
        facts: [
          systemMessageText('growthSignals.askedOftenFacts', {
            0: rows.length,
            1: forum,
            2: rows.length - forum,
          }),
          kit.examples(rows.map((r) => r.question)),
        ],
        strength: strengthOf(rows.length * 30),
        action: 'create',
        growth: growth(
          'asked-often',
          [
            figure('askedPosts30', rows.length, { detail: split }),
            views ? figure('forumViews', views) : null,
            figure('latestAsked', rows[0].date, { format: 'date' }),
            figure('matchingPages', 0),
          ],
          table(
            [col('question'), col('source', 'label'), col('date', 'date')],
            rows.map((r) => ({
              question: r.question,
              source: `growth.value.${r.source}`,
              date: r.date,
              url: r.url,
            })),
            'questions',
            rows.some((r) => r.source === 'forum')
              ? '/data/community'
              : LINK.reddit,
          ),
        ),
      }),
    );
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 5);
}

/** Videos on a followed topic published in the last 30 days with many views: make content on the same subject. */
function hotVideoSignals({ yt, followed, now, V }) {
  const since = new Date(now - 30 * DAY).toISOString().slice(0, 10),
    keys = new Map((followed || []).map((t) => [topicKey(t), t])),
    list = Object.values(yt?.topicVideos || {}).filter(
      (v) =>
        day(v.publishedAt) >= since &&
        (v.views || 0) >= V('youtube-hot', 'minViews') &&
        (v.topics || []).some((t) => keys.has(topicKey(t))),
    );
  return list
    .sort((a, b) => b.views - a.views)
    .slice(0, 3)
    .map((v) => {
      const topic = keys.get(
          topicKey(v.topics.find((t) => keys.has(topicKey(t)))),
        ),
        others = list
          .filter(
            (x) =>
              x.id !== v.id &&
              (x.topics || []).some((t) => topicKey(t) === topicKey(topic)),
          )
          .sort((a, b) => b.views - a.views);
      return signal({
        key: `youtube-hot:${v.id}`,
        type: 'timing',
        source: 'youtube',
        url: v.url,
        title: systemMessageText('growthSignals.hotVideoTitle', {
          0: topic,
          1: v.title,
          2: n(v.views),
        }),
        chip: {
          tone: 'violet',
          text: systemMessageText('growthSignals.viewsChip', { 0: n(v.views) }),
        },
        facts: [
          systemMessageText('growthSignals.hotVideoFacts', {
            0: v.channel || '—',
            1: day(v.publishedAt),
            2: n(v.views),
          }),
          ...(v.description ? [String(v.description).slice(0, 200)] : []),
        ],
        strength: strengthOf(v.views / 50),
        action: 'create',
        growth: {
          ...growth(
            'hot-video',
            [
              figure('views', v.views),
              figure('posted', day(v.publishedAt), { format: 'date' }),
              figure('channel', v.channel || '—'),
              v.likes === null || v.likes === undefined
                ? null
                : figure('likes', v.likes),
            ],
            others.length
              ? table(
                  [
                    col('title'),
                    col('channel'),
                    col('views', 'count'),
                    col('date', 'date'),
                  ],
                  others.map((x) => ({
                    title: x.title,
                    channel: x.channel || null,
                    views: x.views ?? null,
                    date: day(x.publishedAt),
                    url: x.url,
                  })),
                  'videos',
                  LINK.youtube,
                )
              : undefined,
          ),
          topic: { name: topic, followed: true },
        },
      });
    });
}

export {
  judge,
  googleChange,
  dedicated,
  discussionRows,
  topicRiseSignals,
  newTopicSignals,
  hotDiscussionSignals,
  askedOftenSignals,
  hotVideoSignals,
  answeredBy,
  words,
  named,
  NAME as TOPIC_SOURCE_NAMES,
};

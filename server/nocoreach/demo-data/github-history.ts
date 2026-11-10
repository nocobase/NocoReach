import { createHash } from 'node:crypto';

const DAY = 86_400_000;

type Samples = Record<string, number>;
interface TrendingEntry {
  repo: string;
  gained?: number | null;
}
interface HotState {
  lastRun?: { day?: string };
  stars?: Record<string, Samples>;
  repos?: Record<string, { createdAt?: string | null }>;
  trending?: Record<string, Partial<Record<string, TrendingEntry[]>>>;
}
interface HotStore {
  mutate(id: string, fn: (old: HotState | null) => HotState | null): unknown;
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const unit = (text: string) =>
  createHash('sha256').update(text).digest()[0] / 255;

/**
 * Demo and mock data only: GitHub hot topics as if it had recorded stars daily for `days` days, rather than once just
 * now, so Gainers has a day, a week and a month to compare. A repository in today's Trending gained what Trending says
 * for today, this week and this month; any other gains a steady few a day. A repository created inside the window has
 * no stars on the day it was created and is recorded from the day after, as a daily read would first meet it. Records a
 * read made stay as they are, so running this again changes nothing.
 */
export async function backdateGitHubStars(
  trends: HotStore,
  id: string,
  days = 31,
) {
  await trends.mutate(id, (old) => {
    const today = old?.lastRun?.day;
    if (!old?.stars || !today) return old;
    const end = Date.parse(`${today}T00:00:00.000Z`);
    const latest = Object.keys(old.trending ?? {})
      .sort()
      .at(-1);
    const listed = latest ? old.trending?.[latest] : undefined;
    const said = (since: string, repo: string) => {
      const gained = listed?.[since]?.find((x) => x.repo === repo)?.gained;
      return typeof gained === 'number' && Number.isFinite(gained)
        ? gained
        : undefined;
    };
    const stars: Record<string, Samples> = {};
    for (const [repo, samples] of Object.entries(old.stars)) {
      const now = samples[today];
      if (!Number.isFinite(now)) {
        stars[repo] = samples;
        continue;
      }
      // Whole days since the day it was created; the first record is the day after.
      const created = Date.parse(
        `${String(old.repos?.[repo]?.createdAt ?? '').slice(0, 10)}T00:00:00.000Z`,
      );
      const age = Number.isFinite(created)
        ? Math.round((end - created) / DAY)
        : Infinity;
      // A repository created inside the window gains its stars evenly from its first day; an older one a steady few.
      const rate = Math.max(
        1,
        Math.round(
          age <= days ? now / age : now * (0.0005 + unit(repo) * 0.002),
        ),
      );
      // Stars gained by so many days back, never fewer than by a nearer day and never more than it has; all of
      // them by the day it was created.
      const anchors: [number, number][] = (
        [
          [0, 0],
          [1, said('daily', repo) ?? rate],
          [7, said('weekly', repo) ?? rate * 7],
          [30, said('monthly', repo) ?? rate * 30],
        ] as [number, number][]
      ).filter(([at]) => at < age);
      if (Number.isFinite(age)) anchors.push([age, now]);
      for (let i = 1; i < anchors.length; i++)
        anchors[i][1] = Math.min(
          now,
          Math.max(anchors[i][1], anchors[i - 1][1]),
        );
      const gainedBy = (d: number) => {
        const next = anchors.findIndex(([at]) => at >= d);
        if (next === -1) {
          const [dl, gl] = anchors[anchors.length - 1];
          return gl + Math.round(((d - dl) * gl) / dl);
        }
        const [d1, g1] = anchors[next];
        if (d1 === d || next === 0) return g1;
        const [d0, g0] = anchors[next - 1];
        return Math.round(g0 + ((g1 - g0) * (d - d0)) / (d1 - d0));
      };
      // Walking back from today, a day never has more stars than the day after it.
      const out: Samples = { ...samples };
      let after = now;
      for (let d = 1; d <= days && d < age; d++) {
        const day = iso(end - d * DAY);
        if (!(day in out))
          out[day] = Math.max(0, Math.min(after, now - gainedBy(d)));
        after = out[day];
      }
      stars[repo] = Object.fromEntries(
        Object.entries(out).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return { ...old, stars };
  });
}

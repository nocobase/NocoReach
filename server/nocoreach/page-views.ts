// What the pages are sent of two large reads, when they ask for it with `view: 'page'` (docs/DEVELOPMENT.md, Backend
// and data). The task list and the strategy state carry copies of each analysis's evidence that only the server reads
// (task starts, the online agent's daily_analysis tool); on 2026-11-05 a project with 69 tasks and 31 analyses sent
// 5 MB and 4.7 MB on every page that showed them. Other callers (API keys, the generic business action, the CLI) still
// get the stored rows; server code reads them directly.
//
// The task list leaves out what the pages never read and keeps everything else as stored, so a field added later
// reaches them until it is left out here too. The strategy state keeps the current analysis whole and cuts the
// earlier analyses down to what their cards show.

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : undefined;
const list = (v: unknown): unknown[] | undefined =>
  Array.isArray(v) ? (v as unknown[]) : undefined;

/** A task of the list as the pages read it. */
export function taskListRow(task: Obj): Obj {
  const evidence = obj(task.evidence);
  if (!evidence) return task;
  const out: Obj = { ...evidence };
  // The analysis a task was handed off from: only when it was captured is read (shared/task-source.ts).
  const context = obj(evidence.context);
  if (context)
    out.context =
      typeof context.capturedAt === 'string'
        ? { capturedAt: context.capturedAt }
        : {};
  const work = obj(evidence.work);
  if (work) {
    const w: Obj = { ...work };
    // Each step's result: only whether it is there and was rejected (shared/task-pending.ts).
    const results = list(work.results);
    if (results)
      w.results = results.map((r) => {
        const result = obj(r);
        return result
          ? result.rejectedAt
            ? { rejectedAt: result.rejectedAt }
            : {}
          : r;
      });
    // Where an article is published: what names a translating step (shared/article-publishing.ts inPlaceLocales).
    const delivery = obj(work.delivery);
    if (delivery) {
      const from = obj(delivery.translateFrom);
      w.delivery = {
        articleId: delivery.articleId,
        locales: delivery.locales,
        translateFrom: from
          ? { published: from.published }
          : (delivery.translateFrom ?? null),
      };
    }
    out.work = w;
  }
  return { ...task, evidence: out };
}

const pick = (o: Obj | undefined, keys: string[]): Obj | undefined =>
  o
    ? Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]))
    : undefined;

/** An earlier analysis as its cards read it (client/pages/strategy, shared/strategy-pending.ts). */
function earlierAnalysis(batch: unknown): unknown {
  const b = obj(batch);
  const evidence = obj(b?.evidence);
  if (!b || !evidence) return batch;
  const cited = new Set(
    (list(b.items) ?? []).flatMap((item) => list(obj(item)?.signalIds) ?? []),
  );
  const signals = obj(evidence.signals);
  const summary = obj(evidence.summary);
  const out: Obj = {
    ...pick(evidence, ['periodDays', 'analysisVersion']),
  };
  if (summary)
    out.summary = {
      ...(obj(summary.web) ? { web: pick(obj(summary.web), ['days']) } : {}),
      ...(obj(summary.search)
        ? { search: pick(obj(summary.search), ['days']) }
        : {}),
    };
  // Only whether there were any is read (sourceLabels in board.tsx).
  const candidates = list(evidence.industryCandidates);
  if (candidates) out.industryCandidates = candidates.slice(0, 1);
  const sources = list(evidence.publicSources);
  if (sources)
    out.publicSources = sources.map(
      (s) => pick(obj(s), ['id', 'kind', 'title']) ?? s,
    );
  if (signals)
    out.signals = {
      items: (list(signals.items) ?? []).filter((s) => cited.has(obj(s)?.key)),
    };
  return {
    ...pick(b, ['generatedAt', 'items', 'signalReviews']),
    evidence: out,
  };
}

/** A plan handed off: the pages find its task by the opportunity or part it came from (shared/strategy-pending.ts). */
function proposalRow(proposal: unknown): unknown {
  const p = obj(proposal);
  if (!p) return proposal;
  const insight = obj(p.insight);
  return {
    ...pick(p, [
      'id',
      'title',
      'status',
      'taskId',
      'taskNo',
      'part',
      'signalKey',
      'goalVersion',
      'createdAt',
      'approvedAt',
    ]),
    ...(p.insight === undefined
      ? {}
      : { insight: insight ? pick(insight, ['id']) : p.insight }),
  };
}

/** The strategy state, or a mutation's answer that is one, as the pages read it. */
export function strategyPageState(state: unknown): unknown {
  const s = obj(state);
  if (!s) return state;
  const out: Obj = { ...s };
  const proposals = list(s.proposals);
  if (proposals) out.proposals = proposals.map(proposalRow);
  const history = list(s.insightHistory);
  if (history) out.insightHistory = history.map(earlierAnalysis);
  return out;
}

export const wantsPageView = (values: Obj | undefined) =>
  values?.view === 'page';

// Pages (`nrSiteContent/list`) shows each page's title, type, address, date and figures, and its drawer the words read;
// what a page's own read keeps for Site audit and the page identity (its description, canonical and markup counts) is
// sent as `identity` once, not with every page. On 2026-11-06 a site of 1,610 pages sent 1 MB on every range change.
const SITE_PAGE_OMITTED = [
  'description',
  'canonical',
  'h1',
  'imagesNoAlt',
  'noindex',
  'origin',
  'firstSeenAt',
  'fetchedAt',
];
/** A page of Pages' list as the page reads it. */
export function siteListRow(page: Obj): Obj {
  const out: Obj = { ...page };
  for (const k of SITE_PAGE_OMITTED) delete out[k];
  return out;
}

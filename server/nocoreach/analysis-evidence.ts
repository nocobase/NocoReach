// Each daily analysis's evidence is kept whole once (docs/DEVELOPMENT.md, Backend and data). It used to be copied into
// every earlier analysis of the strategy state, every plan and every task handed off from an opportunity: on
// 2026-11-05 a project with 69 tasks and 31 analyses held 4.7 MB of strategy state and 2.7 MB of task copies, read and
// parsed on every request that showed them.
//
// - The current analysis keeps its evidence, without the rule catalog (only `config` of the analysis snapshot is read).
// - An earlier analysis keeps its cards, verdicts and notes, and of its evidence what its cards show: the signals they
//   cite and what `sourceLabels` reads. Its whole evidence is archived in `analysis-evidence:<project>:<generatedAt>`
//   (kept ARCHIVE_KEEP_MS), which the online agent reads for a past day.
// - A task keeps the signals it cites (`insight.signalIds`, `part.signalIds`, `signalKey`), whole, and when the analysis
//   was captured. A plan keeps no evidence: its task is made from the analysis it names.
//
// Each function returns what it is given when it is already in its slim shape or is not evidence, so stored rows of
// either shape (and classic imports) read the same.

type Obj = Record<string, unknown>;

export const ARCHIVE = 'analysis-evidence';
/** How long an earlier analysis's whole evidence is kept after it was made. */
export const ARCHIVE_KEEP_MS = 180 * 86_400_000;
export const archiveKey = (project: string | number, generatedAt: string) =>
  `${ARCHIVE}:${project}:${generatedAt}`;

const obj = (v: unknown): Obj | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : undefined;
const list = (v: unknown): unknown[] =>
  Array.isArray(v) ? (v as unknown[]) : [];
const pick = (o: Obj | undefined, keys: string[]): Obj =>
  o ? Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]])) : {};
const strings = (v: unknown) =>
  list(v).filter((x): x is string => typeof x === 'string');

/** Marks evidence already cut down, so it is never cut again. */
const SLIM = 'slim';
export const isSlim = (evidence: unknown) => obj(evidence)?.[SLIM] === true;

/** The signals a task stands on: its opportunity's, its place's and the change it was handed off from. */
export function citedKeys(cite: {
  insight?: unknown;
  part?: unknown;
  signalKey?: unknown;
}): Set<string> {
  return new Set([
    ...strings(obj(cite.insight)?.signalIds),
    ...strings(obj(cite.part)?.signalIds),
    ...(typeof cite.signalKey === 'string' ? [cite.signalKey] : []),
  ]);
}

const signalsOf = (evidence: Obj | undefined) => obj(evidence?.signals);
const cited = (signals: Obj | undefined, keys: Set<string>) =>
  list(signals?.items).filter((s) => {
    const key = obj(s)?.key;
    return typeof key === 'string' && keys.has(key);
  });

/** The evidence a task keeps. Evidence without signals (a result's, an old plan's) is small and kept as it is. */
export function taskContext(
  evidence: unknown,
  cite: { insight?: unknown; part?: unknown; signalKey?: unknown },
): unknown {
  const e = obj(evidence);
  if (!e || isSlim(e)) return evidence;
  const signals = signalsOf(e);
  if (!signals) return evidence;
  return {
    ...pick(e, [
      'capturedAt',
      'availableThrough',
      'periodDays',
      'analysisVersion',
      'generatedAt',
    ]),
    signals: {
      ...pick(signals, ['analysisRunId', 'computedAt']),
      items: cited(signals, citedKeys(cite)),
    },
    [SLIM]: true,
  };
}

/** The current analysis's evidence, without the rule catalog its snapshot repeats. */
export function withoutCatalog(evidence: unknown): unknown {
  const e = obj(evidence),
    signals = signalsOf(e),
    snapshot = obj(signals?.analysisSnapshot);
  if (!e || !signals || !snapshot || !('catalog' in snapshot)) return evidence;
  const { catalog: _catalog, ...rest } = snapshot;
  return { ...e, signals: { ...signals, analysisSnapshot: rest } };
}

/** An earlier analysis as the state keeps it: what its cards show (client/pages/strategy, shared/strategy-pending.ts). */
export function slimBatch(batch: unknown): unknown {
  const b = obj(batch),
    e = obj(b?.evidence);
  if (!b || !e || isSlim(e)) return batch;
  const keys = new Set(
    list(b.items).flatMap((item) => strings(obj(item)?.signalIds)),
  );
  const signals = signalsOf(e),
    summary = obj(e.summary);
  const evidence: Obj = {
    ...pick(e, [
      'capturedAt',
      'availableThrough',
      'periodDays',
      'analysisVersion',
      'limitations',
    ]),
    [SLIM]: true,
  };
  if (summary)
    evidence.summary = {
      ...(obj(summary.web) ? { web: pick(obj(summary.web), ['days']) } : {}),
      ...(obj(summary.search)
        ? { search: pick(obj(summary.search), ['days']) }
        : {}),
    };
  // Only whether there were any is read (sourceLabels in board.tsx).
  if (Array.isArray(e.industryCandidates))
    evidence.industryCandidates = list(e.industryCandidates).slice(0, 1);
  if (Array.isArray(e.publicSources))
    evidence.publicSources = list(e.publicSources).map((s) =>
      pick(obj(s), ['id', 'kind', 'title']),
    );
  if (signals)
    evidence.signals = {
      ...pick(signals, ['analysisRunId', 'computedAt', 'coverage']),
      items: cited(signals, keys),
    };
  return { ...b, evidence };
}

/** An earlier analysis with its archived whole evidence put back, for a reader that needs every signal. */
export function withArchived(batch: unknown, archived: unknown): unknown {
  const b = obj(batch),
    whole = obj(archived);
  return b && whole && isSlim(b.evidence) ? { ...b, evidence: whole } : batch;
}

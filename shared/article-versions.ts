// Earlier versions of an article (2026-11-04, T-62: the owner wanted back a version they had edited by hand, and could
// neither open it nor restore it). Activity lists every version; each opens against the version before it, and while
// the article waits for review an earlier version of the same round can be restored as a new version, without an Agent
// run. The task page and the server's `restoreArticleVersion` share these rules. A step's versions are those of the
// task's attempt that made them (shared/playbook-change.ts): a step of an earlier playbook under the same key is
// another step.

import { attemptOf } from './playbook-change.js';

/** Where a restored version's text came from; `byHand` says whether a person wrote that text. */
export type RestoredFrom = {
  artifactId: string;
  version: number;
  byHand: boolean;
};

type Proposal = {
  baseKey: string | null;
  also?: readonly { targetId: string; baseKey: string | null }[];
};
export type ArticleVersion = {
  id: string;
  stepId: string;
  planVersion?: number;
  attempt?: number;
  version: number;
  createdAt: string;
  createdBy: string;
  article?: Proposal | null;
  restoredFrom?: RestoredFrom;
};

/**
 * Whether a person wrote the version's text: saved with Edit directly, or restored from a version a person wrote. A
 * restored version is made by a person, but its text is the restored one's.
 */
export const writtenByHand = (
  a: Pick<ArticleVersion, 'createdBy' | 'restoredFrom'>,
) =>
  a.restoredFrom ? Boolean(a.restoredFrom.byHand) : a.createdBy !== 'agent';

type StepVersion = Pick<ArticleVersion, 'stepId' | 'planVersion' | 'attempt'>;
const ofStep = <T extends StepVersion>(
  versions: readonly T[],
  step: Pick<ArticleVersion, 'stepId' | 'attempt'>,
) =>
  versions.filter(
    (v) =>
      v.stepId === step.stepId &&
      !v.planVersion &&
      attemptOf(v) === attemptOf(step),
  );

/** The version of the same step before this one, which its Changes compare with; the first has none. */
export function previousVersion<
  T extends Pick<
    ArticleVersion,
    'stepId' | 'planVersion' | 'attempt' | 'version'
  >,
>(versions: readonly T[], a: T): T | undefined {
  return ofStep(versions, a)
    .filter((v) => v.version < a.version)
    .sort((x, y) => y.version - x.version)[0];
}

/** The number the step's next version gets, as `TaskService.flowArtifact` numbers it: after `of` and its step's others. */
export const nextVersion = (
  versions: readonly Pick<
    ArticleVersion,
    'stepId' | 'planVersion' | 'attempt' | 'version'
  >[],
  of: Pick<ArticleVersion, 'stepId' | 'attempt'>,
) => 1 + Math.max(0, ...ofStep(versions, of).map((v) => v.version));

// After these the step writes something else: the primary language approved, with the others still to write, or
// another primary chosen. Versions from before belong to a round the task has moved past.
const ROUND_STARTS = new Set(['approveStage', 'changePrimary']);
const bases = (a: Proposal) =>
  JSON.stringify([
    a.baseKey,
    ...(a.also || []).map((x) => [x.targetId, x.baseKey]),
  ]);

/**
 * Whether `chosen` can be restored over `current`, the version under review: another article version of the same step,
 * written in the current round and against the same copies of the article (a rebase reads the article again), so a
 * restore never brings back a round or a base the task has moved past.
 */
export function restorable(
  history: readonly { at?: string; action: string }[],
  current: ArticleVersion | null | undefined,
  chosen: ArticleVersion | null | undefined,
): boolean {
  if (!current?.article || !chosen?.article) return false;
  if (
    chosen.id === current.id ||
    chosen.stepId !== current.stepId ||
    attemptOf(chosen) !== attemptOf(current)
  )
    return false;
  const since =
    history
      .filter((e) => ROUND_STARTS.has(e.action) && e.at)
      .map((e) => String(e.at))
      .sort()
      .pop() || '';
  return (
    String(chosen.createdAt) > since &&
    bases(chosen.article) === bases(current.article)
  );
}

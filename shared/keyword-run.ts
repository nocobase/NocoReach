/** A Keywords › AI suggestions lookup proposed in the chat (`propose_keyword_run`) and confirmed there. */
export interface KeywordRunProposal {
  kind: 'list' | 'dig';
  projectId: string;
  /** When the list it was proposed on was made; the card tells whether the list moved on since. */
  revision: string | null;
  market: { locationCode: number; language: string };
  marketChanged: boolean;
  direction: string | null;
  /** A dig's short group name in the user's language, and the group it adds to when one was dug in this direction. */
  name: string | null;
  mergesInto: { id: string; name: string } | null;
  /** Removed keywords the user asked to have back. */
  restore: string[];
  before: string[];
  after: string[];
  added: string[];
  removed: string[];
  /** The seed words and market are what the list already has. */
  same: boolean;
  /** Who chose the new seeds: the AI (with notes) or the user's edit. */
  by: 'ai' | 'person';
  notes: { seed: string; from: string[]; why: string }[];
  maxUsd: number;
  reused: number;
  monthUsd: number;
  budgetUsd: number;
  withinBudget: boolean;
}
export const isKeywordRunProposal = (
  output: unknown,
): output is { proposal: KeywordRunProposal } => {
  const p = (output as { proposal?: Partial<KeywordRunProposal> } | null)
    ?.proposal;
  return Boolean(
    p &&
    (p.kind === 'list' || p.kind === 'dig') &&
    typeof p.projectId === 'string' &&
    Array.isArray(p.after) &&
    p.after.length > 0 &&
    typeof p.maxUsd === 'number',
  );
};

/** A rule definition in words (a custom analysis rule), as the page's Add rule form edits it. */
export type RuleDefinition = {
  name: string;
  source: string;
  condition: string;
  evidence: string;
};
/** A change to one rule's switch or number, with what it was. */
export type RuleChange = {
  ruleId: string;
  /** The rule's name when proposed. */
  rule: string;
  /** `enabled`, or the key of one of the rule's numbers. */
  field: string;
  /** The number's label when proposed; null for the switch. */
  label: string | null;
  unit: string | null;
  before: number | boolean;
  after: number | boolean;
  reason: string;
};
/**
 * A change to AI team › Analysis rules the online agent proposed in the chat (`propose_rule_changes`). It is saved
 * only when the person confirms it there, through the page's own action, against the `revision` it was proposed on.
 */
export type RuleProposal = {
  kind: 'changes' | 'newRule' | 'editRule';
  projectId: string;
  schemeId: string;
  schemeName: string;
  revision: string;
  changes?: RuleChange[];
  newRule?: RuleDefinition & { sourceName: string };
  editRule?: { ruleId: string; before: RuleDefinition; after: RuleDefinition };
};
/** The business action a proposal's Confirm calls; proposing needs the same grant. */
export const proposalAction = (kind: RuleProposal['kind']) =>
  kind === 'changes' ? 'apply' : kind === 'newRule' ? 'addRule' : 'updateRule';
/** A proposal's changes as `nrAnalysisRules.apply` takes them. */
export const toApply = (changes: RuleChange[]) =>
  changes.map(({ ruleId, field, before, after, reason }) => ({
    ruleId,
    field,
    before,
    after,
    reason,
  }));

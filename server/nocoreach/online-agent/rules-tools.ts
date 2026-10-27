import { z } from 'zod';
import type { OnlineTool } from '../../online-agent/executor.js';
import { applyRuleChanges } from '../analysis-rules-proposal.js';
import { customRuleInput } from '../custom-analysis-rules.js';
import { pageData } from './web-tool.js';
import {
  proposalAction,
  toApply,
  type RuleDefinition,
  type RuleProposal,
} from '../../../shared/rule-proposal.js';

type Param = {
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
  unit: string;
  value: number;
};
type RuleView = {
  id: string;
  source: string;
  sourceName?: string;
  label: string;
  description: string;
  custom?: boolean;
  definition?: RuleDefinition & { id: string };
  run?: { status: string; reason?: string };
  enabled: boolean;
  params: Param[];
  found: number | null;
};
/** What `nrAnalysisRules.view` returns, as far as the chat reads it. */
export type RulesView = {
  revision: string;
  schemeId: string;
  schemeName: string;
  activeSchemeId: string;
  schemes: { id: string; name: string }[];
  rules: RuleView[];
  watchDays: number;
  last: {
    computedAt: string;
    found: number | null;
    passed: number | null;
    analyzedAt: string | null;
  } | null;
};
type Snapshot = {
  schemeId: string;
  revision: string;
  catalog: { id: string; source: string; label: string; params: Param[] }[];
  config: Parameters<typeof applyRuleChanges>[1];
  customRules: (RuleDefinition & { id: string })[];
};
/** The parts of `AnalysisRules` (analysis-rules.ts) the chat uses; the same methods the page's actions call. */
export type RulesService = {
  view(projectId: string, schemeId?: string): Promise<RulesView>;
  snapshot(projectId: string, schemeId?: string): Promise<Snapshot>;
};
/** A change the latest analysis found, for "why did this rule fire". */
export type FoundChange = {
  ruleId?: string;
  title?: string;
  facts?: unknown;
  url?: string;
};

/** The rules as the chat reads them: each with its numbers, whether it is on, and what it found last time. */
export function rulesForAgent(view: RulesView, found: FoundChange[] = []) {
  return {
    scheme: {
      id: view.schemeId,
      name: view.schemeName,
      active: view.schemeId === view.activeSchemeId,
    },
    otherSchemes: view.schemes
      .filter((s) => s.id !== view.schemeId)
      .map((s) => ({ id: s.id, name: s.name })),
    latestAnalysis: view.last
      ? {
          at: view.last.analyzedAt || view.last.computedAt,
          changesFound: view.last.found,
          passedToAi: view.last.passed,
        }
      : null,
    longestWatchDays: view.watchDays,
    rules: view.rules.map((rule) => ({
      id: rule.id,
      source: rule.sourceName || rule.source,
      sourceId: rule.source,
      name: rule.label,
      finds: rule.description,
      enabled: rule.enabled,
      ...(rule.custom
        ? {
            custom: true,
            condition: rule.definition?.condition ?? null,
            evidence: rule.definition?.evidence ?? null,
          }
        : {}),
      numbers: rule.params.map((p) => ({
        key: p.key,
        label: p.label,
        value: p.value,
        default: p.default,
        min: p.min,
        max: p.max,
        unit: p.unit || null,
      })),
      // null: not run yet, or it could not run (`lastRun` says why).
      foundLastTime: rule.found,
      ...(rule.run && ['insufficient', 'error'].includes(rule.run.status)
        ? { lastRun: rule.run.status, lastRunReason: rule.run.reason ?? null }
        : {}),
      latestChanges: found
        .filter((c) => c.ruleId === rule.id)
        .slice(0, 5)
        .map((c) => ({
          title: c.title ?? null,
          facts: c.facts ?? null,
          page: c.url ?? null,
        })),
    })),
  };
}

const readInput = z.strictObject({
  schemeId: z
    .string()
    .max(100)
    .optional()
    .describe('A scheme id from otherSchemes; omit for the scheme in view.'),
  offset: z.number().int().min(0).default(0),
});
const definition = z.strictObject({
  name: z.string().trim().min(1).max(80),
  source: z.string().min(1).max(100).describe('A sourceId of the rules.'),
  condition: z.string().trim().min(1).max(2000),
  evidence: z.string().trim().min(1).max(2000),
});
const proposeInput = z.strictObject({
  schemeId: z.string().max(100).optional(),
  changes: z
    .array(
      z.strictObject({
        ruleId: z.string().max(100),
        field: z
          .string()
          .max(100)
          .describe('"enabled", or the key of one of the rule numbers.'),
        after: z.union([z.boolean(), z.number().finite()]),
        reason: z.string().trim().min(1).max(600),
      }),
    )
    .min(1)
    .max(30)
    .optional()
    .describe(
      'Turn rules on or off, or change their numbers within min and max.',
    ),
  newRule: definition
    .optional()
    .describe('A new rule in words, checked by AI against saved data.'),
  editRule: definition
    .extend({ ruleId: z.string().max(100) })
    .optional()
    .describe('A changed custom rule (only rules with custom: true).'),
});
const rejected = (reason: string) => ({ rejected: true, reason });
/**
 * `analysis_rules` reads the rules of AI team › Analysis rules and `propose_rule_changes` checks a change to them. A
 * proposal saves nothing: the chat draws it with its before and after and a Confirm button, which calls the page's own
 * action (apply, addRule or updateRule) with the revision read here, so it is refused once the rules have changed.
 * Reading needs `nrAnalysisRules.view`; proposing needs the action its Confirm will call.
 */
export function analysisRulesTools({
  rules,
  projectId,
  schemeId: inView,
  authorize,
  allowed,
  found,
}: {
  rules: RulesService;
  projectId: string;
  /** The scheme the page showed when the conversation was opened from it. */
  schemeId?: string;
  authorize: () => Promise<void>;
  allowed: (resource: string, action: string) => Promise<boolean>;
  found: () => Promise<FoundChange[]>;
}): OnlineTool[] {
  // A scheme opened from the page may have been removed since; the active scheme is read then.
  const view = async (schemeId?: string) => {
    try {
      return await rules.view(projectId, schemeId ?? inView);
    } catch (error) {
      if (schemeId || !inView) throw error;
      return rules.view(projectId);
    }
  };
  return [
    {
      name: 'analysis_rules',
      description:
        "Read the project's analysis rules (AI team › Analysis rules): what each rule finds in the data, whether it is on, its numbers with their range, how many changes it found in the latest analysis and the latest ones it found. Follow nextOffset to read every rule.",
      inputSchema: z.toJSONSchema(readInput),
      async execute(args) {
        await authorize();
        const input = readInput.parse(args);
        if (!(await allowed('nrAnalysisRules', 'view')))
          return { accessDenied: true };
        const current = await view(input.schemeId);
        const changes = (await allowed('nrStrategy', 'state'))
          ? await found().catch(() => [])
          : [];
        return pageData(rulesForAgent(current, changes), input.offset);
      },
    },
    {
      name: 'propose_rule_changes',
      description:
        'Propose one change to the analysis rules for the user to confirm: turn rules on or off and change their numbers (changes), add a rule described in words (newRule), or change a custom rule (editRule) — exactly one of the three. Nothing is saved: the user sees each change with its before and after and confirms it in the chat. Read analysis_rules first; a rejected proposal says what to fix. In your reply, say briefly what the change trades off (what may be missed) and that it applies from the next daily analysis once confirmed.',
      inputSchema: z.toJSONSchema(proposeInput),
      async execute(args) {
        await authorize();
        const input = proposeInput.safeParse(args);
        if (!input.success) return rejected(input.error.message.slice(0, 2000));
        const { changes, newRule, editRule } = input.data;
        const kinds = [changes, newRule, editRule].filter(Boolean).length;
        if (kinds !== 1)
          return rejected(
            'Give exactly one of changes, newRule and editRule; propose the others separately.',
          );
        const kind = changes ? 'changes' : newRule ? 'newRule' : 'editRule';
        const action = proposalAction(kind);
        if (
          !(await allowed('nrAnalysisRules', 'view')) ||
          !(await allowed('nrAnalysisRules', action))
        )
          return { accessDenied: true };
        const current = await view(input.data.schemeId),
          snapshot = await rules.snapshot(projectId, current.schemeId);
        if (snapshot.revision !== current.revision)
          return rejected('The rules changed while reading; try again.');
        const proposal: RuleProposal = {
          kind,
          projectId,
          schemeId: current.schemeId,
          schemeName: current.schemeName,
          revision: current.revision,
        };
        const byId = new Map(current.rules.map((r) => [r.id, r]));
        const sources = new Map(
          current.rules.map((r) => [r.source, r.sourceName || r.source]),
        );
        if (changes) {
          const out: NonNullable<RuleProposal['changes']> = [];
          for (const change of changes) {
            const rule = byId.get(change.ruleId);
            if (!rule) return rejected(`No rule ${change.ruleId}.`);
            const param =
              change.field === 'enabled'
                ? undefined
                : rule.params.find((p) => p.key === change.field);
            if (change.field !== 'enabled' && !param)
              return rejected(
                `${rule.id} has no number ${change.field}; its numbers are ${rule.params.map((p) => p.key).join(', ') || 'none'}.`,
              );
            if (param) {
              if (
                typeof change.after !== 'number' ||
                change.after < param.min ||
                change.after > param.max
              )
                return rejected(
                  `${rule.id}.${param.key} must be a number from ${param.min} to ${param.max}.`,
                );
            } else if (typeof change.after !== 'boolean')
              return rejected(`${rule.id}.enabled must be true or false.`);
            const before = param ? param.value : rule.enabled;
            if (before === change.after)
              return rejected(
                `${rule.id}.${change.field} is already ${String(before)}.`,
              );
            out.push({
              ruleId: rule.id,
              rule: rule.label,
              field: change.field,
              label: param?.label ?? null,
              unit: param?.unit || null,
              before,
              after: change.after,
              reason: change.reason,
            });
          }
          // The same check `apply` makes when the user confirms (the rank range, for one).
          try {
            applyRuleChanges(snapshot.catalog, snapshot.config, toApply(out));
          } catch (error) {
            return rejected((error as Error).message);
          }
          proposal.changes = out;
        } else if (newRule) {
          const rule = customRuleInput.parse(newRule);
          if (!sources.has(rule.source))
            return rejected(
              `source must be one of ${[...sources.keys()].join(', ')}.`,
            );
          if (current.rules.some((r) => r.label === rule.name))
            return rejected(`A rule named ${rule.name} already exists.`);
          if (snapshot.customRules.length >= 20)
            return rejected('A scheme holds at most 20 rules in words.');
          proposal.newRule = { ...rule, sourceName: sources.get(rule.source)! };
        } else if (editRule) {
          const { ruleId, ...fields } = editRule;
          const rule = byId.get(ruleId);
          if (!rule?.custom || !rule.definition)
            return rejected(`${ruleId} is not a custom rule.`);
          const after = customRuleInput.parse(fields);
          if (!sources.has(after.source))
            return rejected(
              `source must be one of ${[...sources.keys()].join(', ')}.`,
            );
          if (
            current.rules.some((r) => r.id !== ruleId && r.label === after.name)
          )
            return rejected(`A rule named ${after.name} already exists.`);
          const { name, source, condition, evidence } = rule.definition;
          const before = { name, source, condition, evidence };
          if (JSON.stringify(before) === JSON.stringify(after))
            return rejected('The rule would not change.');
          proposal.editRule = { ruleId, before, after };
        }
        return {
          proposal,
          shownToUser:
            'The user sees this with its before and after and a Confirm button. Nothing is saved until they confirm; do not repeat the changes in full.',
        };
      },
    },
  ];
}

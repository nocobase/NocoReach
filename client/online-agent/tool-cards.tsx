import type { ComponentType } from 'react';
import { $t } from '#i18n';
import type { OnlineRun } from '../../shared/online-agent.js';
import {
  RuleProposalCard,
  isRuleProposal,
} from '../pages/analysis-rules/proposal-card.js';

export type ToolCardProps = { run: OnlineRun; output: unknown };
/**
 * Tool results the conversation draws as a card instead of the folded tool call: what the AI proposed, for the person
 * to confirm there. `applies` decides from the result (a rejected proposal stays folded).
 */
export const TOOL_CARDS: Readonly<
  Record<
    string,
    {
      applies: (output: unknown) => boolean;
      Card: ComponentType<ToolCardProps>;
    }
  >
> = {
  propose_rule_changes: { applies: isRuleProposal, Card: RuleProposalCard },
};

/** The card for a tool call's result, with the parsed result; null when it stays a folded tool call. */
export function toolCard(
  name: string,
  result?: { ok: boolean; output: string },
) {
  const card = TOOL_CARDS[name];
  if (!card || !result?.ok) return null;
  let output: unknown;
  try {
    output = JSON.parse(result.output);
  } catch {
    return null;
  }
  return card.applies(output) ? { Card: card.Card, output } : null;
}

/** What a tool call did, in words, wherever a conversation lists its tool calls. */
export const toolLabel = (name: string) =>
  name === 'project_data'
    ? $t('onlineAgent.readProject')
    : name === 'read_page'
      ? $t('onlineAgent.readPage')
      : name === 'daily_analysis'
        ? $t('strategy.toolDailyAnalysis')
        : name === 'task_list' || name === 'task_get'
          ? $t('strategy.toolTasks')
          : name === 'analysis_rules'
            ? $t('onlineAgent.readRules')
            : name === 'propose_rule_changes'
              ? $t('onlineAgent.proposeRules')
              : name;

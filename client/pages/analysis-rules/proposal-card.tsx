/* eslint-disable react-refresh/only-export-components -- the card's result check is exported beside it */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { $t, $legacyText } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { toast } from '#lib/toast';
import { Tag } from '#components/reach/tag';
import { Button } from '#components/ui/button';
import { useBusinessAccess } from '#hooks/use-business-access';
import {
  notifyPageChange,
  usePageChange,
} from '../../online-agent/page-changes.js';
import {
  proposalAction,
  toApply,
  type RuleDefinition,
  type RuleProposal,
} from '../../../shared/rule-proposal.js';
import type { OnlineRun } from '../../../shared/online-agent.js';
import { ruleUnitLabel } from './labels';
import type { View } from './types';

export const isRuleProposal = (
  output: unknown,
): output is { proposal: RuleProposal } => {
  const proposal = (output as { proposal?: Partial<RuleProposal> } | null)
    ?.proposal;
  return Boolean(
    proposal &&
    typeof proposal.revision === 'string' &&
    typeof proposal.schemeId === 'string' &&
    typeof proposal.projectId === 'string' &&
    (proposal.changes?.length || proposal.newRule || proposal.editRule),
  );
};
const FIELDS = ['name', 'source', 'condition', 'evidence'] as const;
const fieldLabel = (field: (typeof FIELDS)[number]) =>
  $t(`analysisSchemes.${field}`);

/** Whether the rules in view already read as the proposal would leave them. */
function applied(proposal: RuleProposal, view: View) {
  if (proposal.changes)
    return proposal.changes.every((change) => {
      const rule = view.rules.find((r) => r.id === change.ruleId);
      if (!rule) return false;
      return change.field === 'enabled'
        ? rule.enabled === change.after
        : rule.params.find((p) => p.key === change.field)?.value ===
            change.after;
    });
  const wanted = proposal.newRule ?? proposal.editRule?.after;
  if (!wanted) return false;
  const rule = proposal.editRule
    ? view.rules.find((r) => r.id === proposal.editRule!.ruleId)
    : view.rules.find((r) => r.custom && r.label === wanted.name);
  return FIELDS.every((field) => rule?.definition?.[field] === wanted[field]);
}

/**
 * A change to the analysis rules the AI proposed in the chat (`propose_rule_changes`), each change with its before and
 * after. Confirm saves it through the page's own action against the revision it was proposed on, so it is refused once
 * the rules have changed; the rules page then reads them again. The card's state comes from the rules as they are now:
 * waiting while they are unchanged, saved once they read as proposed, out of date otherwise.
 */
export function RuleProposalCard({
  output,
}: {
  run: OnlineRun;
  output: unknown;
}) {
  const proposal = (output as { proposal: RuleProposal }).proposal;
  const { projectId, schemeId } = proposal;
  const action = proposalAction(proposal.kind);
  const { can } = useBusinessAccess(`nrAnalysisRules.${action}`, projectId);
  const [view, setView] = useState<View>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    api
      .action<View>('nrAnalysisRules', 'view', {
        method: 'POST',
        body: { projectId, schemeId },
        unwrap: 'data',
      })
      .then(
        (next) => {
          if (live) setView(next);
        },
        // Without the rules the card still shows the proposal, with nothing to confirm.
        () => undefined,
      );
    return () => {
      live = false;
    };
  }, [projectId, schemeId, version]);
  const reload = () => setVersion((v) => v + 1);
  // Another card or the page saved a change: this one may be out of date now.
  usePageChange('analysisRules', projectId, reload);
  const state = !view
    ? undefined
    : view.revision === proposal.revision
      ? 'pending'
      : applied(proposal, view)
        ? 'saved'
        : 'outdated';
  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      const body =
        proposal.kind === 'changes'
          ? { revision: proposal.revision, changes: toApply(proposal.changes!) }
          : proposal.kind === 'newRule'
            ? {
                expectedRevision: proposal.revision,
                rule: definitionOf(proposal.newRule!),
              }
            : {
                expectedRevision: proposal.revision,
                ruleId: proposal.editRule!.ruleId,
                rule: proposal.editRule!.after,
              };
      const next = await api.action<View>('nrAnalysisRules', action, {
        method: 'POST',
        body: { projectId, schemeId, ...body },
        unwrap: 'data',
      });
      if (!aliveRef.current) return;
      setView(next);
      toast.success(() => $t('analysisRules.savedTakesEffectNextAnalysis'));
      notifyPageChange('analysisRules', projectId);
    } catch (e) {
      if (!aliveRef.current) return;
      const failure = e as { status?: number; code?: string; message?: string };
      // Demo Mode explains its refusal in its own toast.
      if (failure.code !== 'DEMO_READ_ONLY')
        setError(
          failure.status === 409
            ? $t('analysisRules.settingsChanged')
            : $legacyText(failure.message || '') || $t('common.saveFailed'),
        );
      if (failure.status === 409) reload();
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  };
  const ruleName = (id: string, fallback: string) =>
    $legacyText(view?.rules.find((r) => r.id === id)?.label || fallback);
  const sourceName = (source: string, fallback?: string) =>
    view?.rules.find((r) => r.source === source)?.sourceName ||
    fallback ||
    source;
  return (
    <section
      className='flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 text-sm text-card-foreground'
      aria-label={$t('analysisRules.proposedChanges')}
      data-rule-proposal={state ?? 'loading'}
    >
      <div className='flex flex-wrap items-center gap-2'>
        <h3 className='font-medium'>
          {$t(
            proposal.kind === 'newRule'
              ? 'analysisRules.proposedRule'
              : 'analysisRules.proposedChanges',
          )}
        </h3>
        {(view?.schemes?.length ?? 0) > 1 ? (
          <Tag tone='grey'>{proposal.schemeName}</Tag>
        ) : null}
        {state === 'saved' ? (
          <Tag tone='green' dot>
            {$t('analysisRules.proposalSaved')}
          </Tag>
        ) : state === 'outdated' ? (
          <Tag tone='slate' dot>
            {$t('analysisRules.proposalOutdated')}
          </Tag>
        ) : null}
      </div>
      {proposal.changes ? (
        <ul className='divide-y'>
          {proposal.changes.map((change) => {
            const rule = view?.rules.find((r) => r.id === change.ruleId);
            const param = rule?.params.find((p) => p.key === change.field);
            const label = param?.label ?? change.label;
            const unit = param?.unit ?? change.unit;
            const value = (v: number | boolean) =>
              typeof v === 'boolean'
                ? $t(v ? 'analysisRules.enabled' : 'analysisRules.disabled')
                : `${v}${unit ? `${unit === '%' ? '' : ' '}${ruleUnitLabel(unit, v)}` : ''}`;
            return (
              <li
                key={`${change.ruleId}:${change.field}`}
                className='flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0'
              >
                <p className='font-medium'>
                  {ruleName(change.ruleId, change.rule)}
                </p>
                <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-1'>
                  <span className='text-muted-foreground'>
                    {label ? $legacyText(label) : $t('analysisRules.ruleState')}
                  </span>
                  <BeforeAfter
                    before={value(change.before)}
                    after={value(change.after)}
                  />
                </div>
                <p className='text-xs text-muted-foreground'>{change.reason}</p>
              </li>
            );
          })}
        </ul>
      ) : proposal.newRule ? (
        <dl className='flex flex-col gap-2'>
          {FIELDS.map((field) => (
            <div key={field}>
              <dt className='text-xs text-muted-foreground'>
                {fieldLabel(field)}
              </dt>
              <dd className='break-words whitespace-pre-wrap'>
                {field === 'source'
                  ? sourceName(
                      proposal.newRule!.source,
                      proposal.newRule!.sourceName,
                    )
                  : proposal.newRule![field]}
              </dd>
            </div>
          ))}
        </dl>
      ) : proposal.editRule ? (
        <>
          <p className='font-medium'>
            {ruleName(proposal.editRule.ruleId, proposal.editRule.before.name)}
          </p>
          <ul className='divide-y'>
            {FIELDS.filter(
              (field) =>
                proposal.editRule!.before[field] !==
                proposal.editRule!.after[field],
            ).map((field) => {
              const show = (v: string) =>
                field === 'source' ? sourceName(v) : v;
              return (
                <li
                  key={field}
                  className='flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0'
                >
                  <span className='text-xs text-muted-foreground'>
                    {fieldLabel(field)}
                  </span>
                  <BeforeAfter
                    block
                    before={show(proposal.editRule!.before[field])}
                    after={show(proposal.editRule!.after[field])}
                  />
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      {state === 'pending' ? (
        can ? (
          <div className='flex flex-wrap items-center justify-between gap-3 border-t pt-3'>
            <p className='min-w-0 flex-1 text-xs text-muted-foreground'>
              {$t('analysisRules.confirmationHelp')}
            </p>
            <Button size='sm' disabled={busy} onClick={() => void confirm()}>
              {busy ? (
                <Loader2 className='animate-spin' data-icon='inline-start' />
              ) : null}
              {$t('analysisRules.confirmChanges')}
            </Button>
          </div>
        ) : (
          <p className='border-t pt-3 text-xs text-muted-foreground'>
            {$t('analysisRules.proposalNoPermission')}
          </p>
        )
      ) : state === 'outdated' ? (
        <p className='border-t pt-3 text-xs text-muted-foreground'>
          {$t('analysisRules.proposalOutdatedHelp')}
        </p>
      ) : null}
      {error ? (
        <p role='alert' className='nr-error'>
          {error}
        </p>
      ) : null}
    </section>
  );
}
const definitionOf = ({
  name,
  source,
  condition,
  evidence,
}: RuleDefinition) => ({
  name,
  source,
  condition,
  evidence,
});
/** What a field was, muted, and what it becomes, in full. */
function BeforeAfter({
  before,
  after,
  block = false,
}: {
  before: ReactNode;
  after: ReactNode;
  block?: boolean;
}) {
  return (
    <span
      className={
        block
          ? 'flex flex-col gap-0.5 break-words whitespace-pre-wrap'
          : 'tabular-nums'
      }
    >
      <span className='text-muted-foreground'>{before}</span>
      {block ? null : <span aria-hidden='true'> → </span>}
      <span className='sr-only'> {$t('analysisRules.changedTo')} </span>
      <span className='font-medium'>{after}</span>
    </span>
  );
}

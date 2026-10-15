import { useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { $t, $legacyText, useMessageState } from '#i18n';
import { Button } from '#components/ui/button';
import { Textarea } from '#components/ui/textarea';
import type { Proposal, View } from './types';

export function RulesAssistant({
  view,
  busy,
  propose,
  apply,
}: {
  view: View;
  busy: boolean;
  propose: (instruction: string) => Promise<Proposal | undefined>;
  apply: (proposal: Proposal) => Promise<boolean>;
}) {
  const [instruction, setInstruction] = useState('');
  const [proposal, setProposal] = useState<Proposal>();
  const [error, setError] = useMessageState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const active = proposal?.revision === view.revision ? proposal : undefined;
  const generate = async () => {
    if (!instruction.trim()) {
      setError(() => $t('analysisRules.instructionRequired'));
      inputRef.current?.focus();
      return;
    }
    setError('');
    try {
      const result = await propose(instruction.trim());
      setProposal(result);
      if (result) requestAnimationFrame(() => previewRef.current?.focus());
    } catch (e) {
      setError(() =>
        e instanceof Error ? e.message : $t('analysisRules.proposalFailed'),
      );
    }
  };
  return (
    <div className='flex flex-col gap-3' data-rule-assistant=''>
      <label className='text-sm font-medium' htmlFor='rules-instruction'>
        {$t('analysisRules.adjustmentRequest')}
      </label>
      <Textarea
        ref={inputRef}
        id='rules-instruction'
        rows={3}
        maxLength={2000}
        value={instruction}
        disabled={busy}
        placeholder={$t('analysisRules.requestPlaceholder')}
        onChange={(e) => {
          setInstruction(e.target.value);
          setProposal(undefined);
          setError('');
        }}
      />
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Button
          variant='ghost'
          size='sm'
          disabled={busy}
          onClick={() => {
            setInstruction($t('analysisRules.requestExample'));
            setProposal(undefined);
            setError('');
            inputRef.current?.focus();
          }}
        >
          {$t('analysisRules.useExample')}
        </Button>
        {!active ? (
          <Button
            disabled={busy || !instruction.trim()}
            onClick={() => void generate()}
          >
            {busy ? (
              <Loader2 className='animate-spin' data-icon='inline-start' />
            ) : (
              <Sparkles data-icon='inline-start' />
            )}
            {$t('analysisRules.previewChanges')}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role='alert' className='nr-error'>
          {error}
        </p>
      ) : null}
      {active ? (
        <div
          ref={previewRef}
          tabIndex={-1}
          className='flex flex-col gap-3 rounded-lg border p-4'
          aria-label={$t('analysisRules.proposedChanges')}
        >
          <h3 className='text-sm font-medium'>
            {$t('analysisRules.proposedChanges')}
          </h3>
          <p className='whitespace-pre-wrap text-sm text-muted-foreground'>
            {active.explanation}
          </p>
          {active.changes.length ? (
            <>
              <ul className='divide-y'>
                {active.changes.map((change) => {
                  const rule = view.rules.find((r) => r.id === change.ruleId);
                  const param = rule?.params.find(
                    (p) => p.key === change.field,
                  );
                  const format = (value: number | boolean) =>
                    typeof value === 'boolean'
                      ? $t(
                          value
                            ? 'analysisRules.enabled'
                            : 'analysisRules.disabled',
                        )
                      : `${value}${param?.unit ? ` ${$legacyText(param.unit)}` : ''}`;
                  return (
                    <li
                      key={`${change.ruleId}:${change.field}`}
                      className='flex flex-col gap-1 py-3 text-sm'
                    >
                      <p className='font-medium'>
                        {$legacyText(rule?.label || change.ruleId)}
                      </p>
                      <div className='flex flex-wrap items-center justify-between gap-2'>
                        <span>
                          {$legacyText(param?.label || '') ||
                            $t('analysisRules.ruleState')}
                        </span>
                        <span className='tabular-nums'>
                          <span className='text-muted-foreground'>
                            {format(change.before)}
                          </span>
                          <span aria-hidden='true'> → </span>
                          <span className='sr-only'>
                            {$t('analysisRules.changedTo')}
                          </span>
                          <span className='font-medium'>
                            {format(change.after)}
                          </span>
                        </span>
                      </div>
                      <p className='text-xs text-muted-foreground'>
                        {change.reason}
                      </p>
                    </li>
                  );
                })}
              </ul>
              <p className='text-xs text-muted-foreground'>
                {$t('analysisRules.confirmationHelp')}
              </p>
            </>
          ) : (
            <p className='text-sm'>{$t('analysisRules.noProposedChanges')}</p>
          )}
          <div className='flex flex-wrap justify-end gap-2'>
            <Button
              variant='outline'
              disabled={busy}
              onClick={() => {
                setProposal(undefined);
                setError('');
                inputRef.current?.focus();
              }}
            >
              {$t('common.cancel')}
            </Button>
            {active.changes.length ? (
              <Button
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    setError('');
                    try {
                      if (await apply(active)) {
                        setProposal(undefined);
                        inputRef.current?.focus();
                      }
                    } catch (e) {
                      setError(() =>
                        e instanceof Error
                          ? e.message
                          : $t('common.saveFailed'),
                      );
                    }
                  })();
                }}
              >
                {busy ? (
                  <Loader2 className='animate-spin' data-icon='inline-start' />
                ) : null}
                {$t('analysisRules.confirmChanges')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

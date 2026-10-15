import { useEffect, useRef, useState } from 'react';
import { Copy, Plus, Sparkles, Loader2 } from 'lucide-react';
import { $t, useMessageState } from '#i18n';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '#components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '#components/ui/alert-dialog';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '#components/ui/tooltip';
import { Section } from '#components/reach/page';
import { getSourceNames } from '../strategy/board';
import type { View, Rule } from './types';
type Execute = (
  action: 'create' | 'activate' | 'addRule' | 'updateRule',
  body: object,
) => Promise<View | undefined>;
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : $t('common.saveFailed');
export function SchemeManager({
  view,
  disabled,
  admin,
  select,
  execute,
}: {
  view: View;
  disabled: boolean;
  admin: boolean;
  select: (id: string) => void;
  execute: Execute;
}) {
  const [dialog, setDialog] = useState<null | 'create' | 'activate'>(null),
    [target, setTarget] = useState(''),
    [name, setName] = useState(''),
    [error, setError] = useMessageState('');
  const triggerRef = useRef<HTMLElement | null>(null);
  if (!view.schemes) return null;
  const open = (mode: 'create' | 'activate', id = '') => {
    triggerRef.current = document.activeElement as HTMLElement;
    setTarget(id);
    setName(
      id && mode === 'create'
        ? `${view.schemes?.find((s) => s.id === id)?.name?.slice(0, 30)} · ${$t('analysisSchemes.copySuffix')}`.slice(
            0,
            40,
          )
        : '',
    );
    setError('');
    setDialog(mode);
  };
  const close = () => {
    if (!disabled) setDialog(null);
  };
  const submit = async () => {
    try {
      await execute(
        dialog === 'activate' ? 'activate' : 'create',
        dialog === 'activate'
          ? { schemeId: target, storeRevision: view.storeRevision }
          : {
              name,
              copyFrom: target || undefined,
              storeRevision: view.storeRevision,
            },
      );
      setDialog(null);
    } catch (e) {
      setError(() => errorText(e));
    }
  };
  return (
    <Section
      title={$t('analysisSchemes.title')}
      description={$t('analysisSchemes.help')}
      actions={
        admin ? (
          <Button
            variant='outline'
            size='sm'
            disabled={disabled || view.schemes.length >= 5}
            onClick={() => open('create')}
          >
            <Plus className='size-4' />
            {$t('analysisSchemes.new')}
          </Button>
        ) : undefined
      }
    >
      <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-3'>
        {view.schemes.map((s) => (
          <div
            key={s.id}
            data-scheme={s.id}
            className={`flex items-center gap-2 rounded-lg border p-3 ${s.id === view.schemeId ? 'border-primary bg-primary/5' : ''}`}
          >
            <button
              type='button'
              className='min-w-0 flex-1 text-left text-sm'
              disabled={disabled}
              aria-pressed={s.id === view.schemeId}
              onClick={() => select(s.id)}
            >
              <span className='block break-words font-medium'>{s.name}</span>
              <span className='text-xs text-muted-foreground'>
                {s.id === view.activeSchemeId
                  ? $t('analysisSchemes.active')
                  : $t('analysisSchemes.inactive')}
              </span>
            </button>
            {admin ? (
              <>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant='ghost'
                        size='icon'
                        disabled={disabled || view.schemes!.length >= 5}
                        aria-label={$t('analysisSchemes.copyNamed', {
                          0: s.name,
                        })}
                        onClick={() => open('create', s.id)}
                      >
                        <Copy className='size-4' />
                      </Button>
                    }
                  />
                  <TooltipContent>
                    {$t('analysisSchemes.copyNamed', { 0: s.name })}
                  </TooltipContent>
                </Tooltip>
                {s.id !== view.activeSchemeId ? (
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={disabled}
                    onClick={() => open('activate', s.id)}
                  >
                    {$t('analysisSchemes.use')}
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        ))}
      </div>
      <p className='text-xs text-muted-foreground'>
        {$t('analysisSchemes.count', { 0: view.schemes.length })}
      </p>
      <Dialog
        open={dialog === 'create'}
        disablePointerDismissal
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          finalFocus={triggerRef}
          className='flex flex-col overflow-hidden sm:max-w-xl'
        >
          <DialogTitle>
            {target
              ? $t('analysisSchemes.copyNamed', {
                  0: view.schemes.find((s) => s.id === target)?.name,
                })
              : $t('analysisSchemes.new')}
          </DialogTitle>
          <DialogDescription>
            {$t('analysisSchemes.copyHelp')}
          </DialogDescription>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className='flex flex-col gap-4'
          >
            <label className='flex flex-col gap-2 text-sm'>
              <span>{$t('analysisSchemes.name')} *</span>
              <Input
                autoFocus
                required
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={disabled}
                aria-invalid={Boolean(error)}
              />
              {error ? (
                <p role='alert' className='text-sm text-destructive'>
                  {error}
                </p>
              ) : null}
            </label>
            <div className='flex justify-end gap-2'>
              <Button variant='outline' disabled={disabled} onClick={close}>
                {$t('common.cancel')}
              </Button>
              <Button type='submit' disabled={disabled}>
                {disabled ? <Loader2 className='size-4 animate-spin' /> : null}
                {$t('common.save')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={dialog === 'activate'}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <AlertDialogContent finalFocus={triggerRef}>
          <AlertDialogTitle>
            {$t('analysisSchemes.useNamed', {
              0: view.schemes.find((s) => s.id === target)?.name,
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {$t('analysisSchemes.activateHelp')}
          </AlertDialogDescription>
          {error ? (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          ) : null}
          <div className='flex justify-end gap-2'>
            <Button variant='outline' disabled={disabled} onClick={close}>
              {$t('common.cancel')}
            </Button>
            <Button disabled={disabled} onClick={() => void submit()}>
              {$t('analysisSchemes.use')}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}
export type RuleDraft = {
  name: string;
  source: string;
  condition: string;
  evidence: string;
};
export function AddRule({
  rule,
  view,
  disabled,
  execute,
  draft,
}: {
  view: View;
  disabled: boolean;
  execute: Execute;
  rule?: Rule;
  draft: (
    instruction: string,
  ) => Promise<{ draft: RuleDraft; revision: string }>;
}) {
  const [open, setOpen] = useState(false),
    [fields, setFields] = useState<RuleDraft>({
      name: '',
      source: '',
      condition: '',
      evidence: '',
    }),
    [instruction, setInstruction] = useState(''),
    [proposal, setProposal] = useState<RuleDraft>(),
    [error, setError] = useMessageState(''),
    [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({}),
    [working, setWorking] = useState(false),
    [revision, setRevision] = useState('');
  const triggerRef = useRef<HTMLElement | null>(null),
    epochRef = useRef(0),
    inflightRef = useRef(false);
  useEffect(
    () => () => {
      ++epochRef.current;
    },
    [],
  );
  const sources = [...new Set(view.rules.map((r) => r.source))];
  const label = (source: string) =>
    view.rules.find((r) => r.source === source)?.sourceName ||
    getSourceNames()[source] ||
    source;
  const close = () => {
    if (disabled) return;
    ++epochRef.current;
    inflightRef.current = false;
    setWorking(false);
    setOpen(false);
  };
  const organize = async () => {
    if (inflightRef.current) return;
    if (!instruction.trim()) {
      setError(() => $t('analysisRules.instructionRequired'));
      return;
    }
    const request = ++epochRef.current;
    inflightRef.current = true;
    setWorking(true);
    setError('');
    setProposal(undefined);
    try {
      const result = await draft(instruction);
      if (request === epochRef.current) {
        if (result.revision !== revision) {
          setError(() => $t('analysisRules.settingsChanged'));
          return;
        }
        setProposal(result.draft);
      }
    } catch (e) {
      if (request === epochRef.current) setError(() => errorText(e));
    } finally {
      if (request === epochRef.current) {
        setWorking(false);
        inflightRef.current = false;
      }
    }
  };
  const submit = async () => {
    const invalid = Object.fromEntries(
      ['name', 'condition', 'evidence']
        .filter((key) => !fields[key as keyof RuleDraft].trim())
        .map((key) => [key, true]),
    );
    setFieldErrors(invalid);
    if (Object.keys(invalid).length) {
      document
        .querySelector<HTMLElement>(`[name="rule-${Object.keys(invalid)[0]}"]`)
        ?.focus();
      return;
    }
    try {
      const result = await execute(rule ? 'updateRule' : 'addRule', {
        ruleId: rule?.id,
        schemeId: view.schemeId,
        expectedRevision: revision,
        rule: {
          name: fields.name,
          source: fields.source,
          condition: fields.condition,
          evidence: fields.evidence,
        },
      });
      if (result) close();
    } catch (e) {
      setError(() => errorText(e));
    }
  };
  return (
    <>
      <Button
        variant='outline'
        size='sm'
        disabled={disabled}
        onClick={() => {
          triggerRef.current = document.activeElement as HTMLElement;
          setFields(
            rule?.definition || {
              name: '',
              source: sources[0] || '',
              condition: '',
              evidence: '',
            },
          );
          setFieldErrors({});
          setInstruction('');
          setProposal(undefined);
          setError('');
          setRevision(view.revision);
          setOpen(true);
        }}
      >
        <Plus className='size-4' />
        {$t(rule ? 'common.modify' : 'analysisSchemes.addRule')}
      </Button>
      <Dialog
        open={open}
        disablePointerDismissal
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent
          finalFocus={triggerRef}
          className='flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-xl'
        >
          <DialogTitle>
            {$t(rule ? 'analysisSchemes.editRule' : 'analysisSchemes.addTo', {
              0: rule?.label || view.schemeName,
            })}
          </DialogTitle>
          <DialogDescription>
            {$t('analysisSchemes.ruleHelp')}
          </DialogDescription>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!working) void submit();
            }}
            onInvalidCapture={(e) => {
              const element = e.target as HTMLInputElement;
              const key = element.name.replace('rule-', '');
              setFieldErrors((current) => ({
                ...current,
                [key]: true,
              }));
            }}
            className='flex min-h-0 flex-col gap-4'
          >
            <div className='min-h-0 flex flex-col gap-4 overflow-y-auto pr-1'>
              <div className='flex flex-col gap-3 rounded-lg border bg-muted/30 p-3'>
                <label className='flex flex-col gap-2 text-sm'>
                  <span>{$t('analysisSchemes.intent')}</span>
                  <Textarea
                    rows={2}
                    maxLength={2000}
                    disabled={working}
                    value={instruction}
                    onChange={(e) => {
                      setInstruction(e.target.value);
                      setProposal(undefined);
                    }}
                  />
                </label>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={working}
                  onClick={() => void organize()}
                >
                  {working ? (
                    <Loader2 className='size-4 animate-spin' />
                  ) : (
                    <Sparkles className='size-4' />
                  )}
                  {working
                    ? $t('analysisSchemes.organizing')
                    : $t('analysisSchemes.organize')}
                </Button>
                {proposal ? (
                  <div
                    className='flex flex-col gap-2 border-t pt-3'
                    aria-live='polite'
                  >
                    <p className='text-sm font-medium'>
                      {$t('analysisSchemes.reviewDraft')}
                    </p>
                    <dl className='flex flex-col gap-2 text-sm'>
                      {[
                        [$t('analysisSchemes.name'), proposal.name],
                        [$t('analysisSchemes.source'), label(proposal.source)],
                        [$t('analysisSchemes.condition'), proposal.condition],
                        [$t('analysisSchemes.evidence'), proposal.evidence],
                      ].map(([key, value]) => (
                        <div key={key}>
                          <dt className='text-xs text-muted-foreground'>
                            {key}
                          </dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className='text-xs text-muted-foreground'>
                      {$t('analysisSchemes.replaceHelp')}
                    </p>
                    <div className='flex gap-2'>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => {
                          setFields(proposal);
                          setProposal(undefined);
                        }}
                      >
                        {$t('analysisSchemes.fill')}
                      </Button>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => setProposal(undefined)}
                      >
                        {$t('analysisSchemes.discard')}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
              <label className='flex flex-col gap-2 text-sm'>
                <span>{$t('analysisSchemes.name')} *</span>
                <Input
                  required
                  maxLength={80}
                  name='rule-name'
                  aria-invalid={Boolean(fieldErrors.name)}
                  disabled={disabled}
                  value={fields.name}
                  onChange={(e) =>
                    setFields({ ...fields, name: e.target.value })
                  }
                />
                {fieldErrors.name ? (
                  <p role='alert' className='text-xs text-destructive'>
                    {$t('analysisSchemes.required')}
                  </p>
                ) : null}
              </label>
              <fieldset className='flex flex-col gap-2'>
                <legend className='text-sm'>
                  {$t('analysisSchemes.source')}
                </legend>
                <div className='flex flex-wrap gap-2'>
                  {sources.map((source) => (
                    <Button
                      key={source}
                      size='sm'
                      variant={
                        source === fields.source ? 'secondary' : 'outline'
                      }
                      aria-pressed={source === fields.source}
                      onClick={() => setFields({ ...fields, source })}
                    >
                      {label(source)}
                    </Button>
                  ))}
                </div>
              </fieldset>
              <label className='flex flex-col gap-2 text-sm'>
                <span>{$t('analysisSchemes.condition')} *</span>
                <Textarea
                  required
                  rows={3}
                  maxLength={2000}
                  name='rule-condition'
                  aria-invalid={Boolean(fieldErrors.condition)}
                  disabled={disabled}
                  value={fields.condition}
                  onChange={(e) =>
                    setFields({ ...fields, condition: e.target.value })
                  }
                />
                {fieldErrors.condition ? (
                  <p role='alert' className='text-xs text-destructive'>
                    {$t('analysisSchemes.required')}
                  </p>
                ) : null}
              </label>
              <label className='flex flex-col gap-2 text-sm'>
                <span>{$t('analysisSchemes.evidence')} *</span>
                <Textarea
                  required
                  rows={2}
                  maxLength={2000}
                  name='rule-evidence'
                  aria-invalid={Boolean(fieldErrors.evidence)}
                  disabled={disabled}
                  value={fields.evidence}
                  onChange={(e) =>
                    setFields({ ...fields, evidence: e.target.value })
                  }
                />
                {fieldErrors.evidence ? (
                  <p role='alert' className='text-xs text-destructive'>
                    {$t('analysisSchemes.required')}
                  </p>
                ) : null}
              </label>
              {error ? (
                <p role='alert' className='text-sm text-destructive'>
                  {error}
                </p>
              ) : null}
            </div>
            <div className='flex shrink-0 justify-end gap-2 border-t pt-4'>
              <Button variant='outline' disabled={disabled} onClick={close}>
                {$t('common.cancel')}
              </Button>
              <Button type='submit' disabled={disabled || working}>
                {disabled ? <Loader2 className='size-4 animate-spin' /> : null}
                {$t(rule ? 'common.save' : 'analysisSchemes.addConfirm')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

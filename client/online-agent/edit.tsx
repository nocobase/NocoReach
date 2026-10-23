import { useId, useRef, useState, type FormEvent } from 'react';
import {
  useParams,
  useOutletContext,
  useNavigate,
  useLocation,
  Link,
} from 'react-router';
import { $t } from '#i18n';
import { toast } from '#lib/toast';
import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';
import { Field, FieldLabel, FieldDescription } from '#components/ui/field';
import { Skeleton } from '#components/ui/skeleton';
import { useBusinessAccess } from '#hooks/use-business-access';
import type {
  OnlineAgentDefinition,
  OnlineModel,
} from '../../shared/online-agent.js';
import {
  useOnlineApi,
  useOnlineResource,
  OnlineApiError,
  type Agent,
} from './api.js';
import { OnlineError, OnlineSelect, OnlineConfirm } from './controls.js';
interface Catalog {
  services: {
    name: string;
    title: string;
    models: { value: string; label: string }[];
  }[];
  defaultModel?: OnlineModel | null;
}
export interface AgentSettingsContext {
  refresh(): void;
  saved(agent: OnlineAgentDefinition): void;
  /** Where closing the dialog returns: the page it opened over. */
  back: string;
}
export default function EditOnlineAgent() {
  const { onlineAgentId } = useParams(),
    { can: canManage, isPending } = useBusinessAccess('nrOnline.manage');
  const [reload, setReload] = useState(0);
  const data = useOnlineResource<Agent[]>('definitions', reload);
  const parent = useOutletContext<AgentSettingsContext>();
  const agent = onlineAgentId
    ? data.data?.find((item) => item.id === onlineAgentId)
    : undefined;
  const navigate = useNavigate(),
    location = useLocation();
  const close = () => {
    parent.refresh();
    void navigate(`${parent.back}${location.search}`);
  };
  if (!canManage || (onlineAgentId && (!agent || data.loading)))
    return (
      <RouteDialog
        title={$t('onlineAgent.edit')}
        footer={
          <Button variant='outline' onClick={close}>
            {$t('onlineAgent.close')}
          </Button>
        }
      >
        {!canManage && !isPending ? (
          <p>{$t('onlineAgent.accessDenied')}</p>
        ) : (
          <>
            <OnlineError
              error={
                data.error ||
                (data.data && !agent
                  ? new OnlineApiError(404, 'agentNotFound')
                  : undefined)
              }
              retry={() => setReload((value) => value + 1)}
            />
            {(data.loading || isPending) && (
              <div role='status' aria-label={$t('common.loading')}>
                <Skeleton className='h-64 w-full' />
              </div>
            )}
          </>
        )}
      </RouteDialog>
    );
  return (
    <AgentForm
      key={`${onlineAgentId || 'new'}:${reload}`}
      agent={agent}
      reload={() => setReload((value) => value + 1)}
      close={close}
    />
  );
}
function AgentForm({
  agent,
  reload,
  close,
}: {
  agent?: OnlineAgentDefinition;
  reload: () => void;
  close: () => void;
}) {
  const api = useOnlineApi(),
    parent = useOutletContext<AgentSettingsContext>();
  const [catalogRevision, setCatalogRevision] = useState(0);
  const catalog = useOnlineResource<Catalog>('models', catalogRevision);
  const [name, setName] = useState(agent?.name || ''),
    [instructions, setInstructions] = useState(agent?.instructions || '');
  const [model, setModel] = useState<OnlineModel | null>(agent?.model || null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [discard, setDiscard] = useState(false),
    [submitted, setSubmitted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null),
    id = useId();
  const nameError = submitted && !name.trim();
  const permanent =
    error instanceof OnlineApiError && [401, 403, 404].includes(error.status);
  const unchanged =
    !!agent &&
    name.trim() === agent.name &&
    instructions === agent.instructions &&
    JSON.stringify(model) === JSON.stringify(agent.model);
  const values = [
    // The default is the daily analysis's model (Agent › Who does the work › Daily analysis › Settings); say which.
    {
      value: '',
      label: catalog.data?.defaultModel
        ? $t('onlineAgent.sameAsAnalysis', {
            0: catalog.data.defaultModel.model,
          })
        : $t('onlineAgent.defaultModel'),
    },
    ...(catalog.data?.services.flatMap((service) =>
      service.models.map((item) => ({
        value: JSON.stringify({
          modelService: service.name,
          model: item.value,
        }),
        label: `${service.title || service.name} / ${item.label}`,
      })),
    ) || []),
  ];
  const modelValue = model ? JSON.stringify(model) : '';
  if (model && !values.some((item) => item.value === modelValue))
    values.push({
      value: modelValue,
      label: `${model.modelService} / ${model.model}`,
    });
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || permanent || unchanged) return;
    setSubmitted(true);
    if (!name.trim()) {
      nameRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const saved = await api<OnlineAgentDefinition>(
        agent ? `definitions/${agent.id}` : 'definitions',
        {
          name: name.trim(),
          instructions,
          model,
          enabled: agent?.enabled ?? true,
          revision: agent?.revision ?? 0,
        },
        agent ? 'PUT' : 'POST',
      );
      parent.saved(saved);
      toast.success(() => $t('onlineAgent.saved', { 0: saved.name }));
      close();
    } catch (failure) {
      if ((failure as Error).name !== 'AbortError') setError(failure);
      if (failure instanceof OnlineApiError && failure.status === 404)
        parent.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <RouteDialog
      title={$t(agent ? 'onlineAgent.edit' : 'onlineAgent.create')}
      className='sm:max-w-2xl'
      beforeClose={() => !busy}
      footer={
        <>
          <Button variant='outline' disabled={busy} onClick={close}>
            {$t(permanent ? 'onlineAgent.close' : 'common.cancel')}
          </Button>
          <Button
            type='submit'
            form={id}
            disabled={busy || permanent || unchanged}
          >
            {$t(busy ? 'common.saving' : 'common.save')}
          </Button>
        </>
      }
    >
      <form
        id={id}
        onSubmit={(event) => void save(event)}
        noValidate
        className='flex flex-col gap-4'
      >
        <OnlineError error={error} />
        {error instanceof OnlineApiError && error.status === 409 && (
          <Button
            variant='outline'
            type='button'
            onClick={() => setDiscard(true)}
          >
            {$t('onlineAgent.reloadDiscard')}
          </Button>
        )}
        <Field data-invalid={nameError || undefined}>
          <FieldLabel htmlFor={`${id}-name`}>
            {$t('onlineAgent.name')} <span aria-hidden='true'>*</span>
          </FieldLabel>
          <Input
            id={`${id}-name`}
            ref={nameRef}
            autoFocus
            required
            maxLength={80}
            value={name}
            disabled={busy}
            aria-invalid={nameError}
            aria-describedby={nameError ? `${id}-name-error` : undefined}
            onChange={(event) => setName(event.target.value)}
          />
          {nameError && (
            <p
              id={`${id}-name-error`}
              className='text-sm text-destructive'
              role='alert'
            >
              {$t('onlineAgent.nameRequired')}
            </p>
          )}
        </Field>
        <OnlineSelect
          label={$t('onlineAgent.model')}
          value={modelValue || '__default__'}
          items={values.map((item) => ({
            ...item,
            value: item.value || '__default__',
          }))}
          disabled={busy || catalog.loading}
          onChange={(value) =>
            setModel(
              value === '__default__'
                ? null
                : (JSON.parse(value) as OnlineModel),
            )
          }
        />
        <OnlineError
          error={catalog.error}
          retry={() => setCatalogRevision((value) => value + 1)}
        />
        <FieldDescription>
          {$t('onlineAgent.modelHelp')}{' '}
          <Link className='underline' to='/agents/models'>
            {$t('onlineAgent.modelSettings')}
          </Link>
        </FieldDescription>
        <Field>
          <FieldLabel htmlFor={`${id}-instructions`}>
            {$t('onlineAgent.instructions')}
          </FieldLabel>
          <Textarea
            id={`${id}-instructions`}
            rows={8}
            maxLength={12000}
            value={instructions}
            disabled={busy}
            onChange={(event) => setInstructions(event.target.value)}
          />
          <FieldDescription>
            {$t('onlineAgent.instructionsHelp')}
          </FieldDescription>
        </Field>
        <OnlineConfirm
          open={discard}
          onClose={() => setDiscard(false)}
          title={$t('onlineAgent.discardEditsTitle', {
            0: agent?.name || name,
          })}
          description={$t('onlineAgent.discardDescription')}
          action={$t('onlineAgent.reloadDiscard')}
          busy={false}
          confirm={reload}
        />
      </form>
    </RouteDialog>
  );
}

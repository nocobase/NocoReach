import { useId, useState, type FormEvent } from 'react';
import { useOutletContext, useNavigate, useLocation, Link } from 'react-router';
import { $t } from '#i18n';
import { toast } from '#lib/toast';
import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { Switch } from '#components/ui/switch';
import { Textarea } from '#components/ui/textarea';
import { Field, FieldLabel, FieldDescription } from '#components/ui/field';
import { Skeleton } from '#components/ui/skeleton';
import { useBusinessAccess } from '#hooks/use-business-access';
import type {
  OnlineChatSettings,
  OnlineModel,
} from '../../shared/online-agent.js';
import {
  useOnlineApi,
  useOnlineResource,
  OnlineApiError,
  type OnlineSettings,
} from './api.js';
import { useOptionalOnlineChat } from './context.js';
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
  /** Where closing the dialog returns: the page it opened over. */
  back: string;
}
/** Chat panel › Settings: whether the online assistant answers, the model it uses and its instructions. */
export default function ChatSettings() {
  const { can: canManage, isPending } = useBusinessAccess('nrOnline.manage');
  const [reload, setReload] = useState(0);
  const data = useOnlineResource<OnlineSettings>('settings', reload);
  const parent = useOutletContext<AgentSettingsContext>();
  const chat = useOptionalOnlineChat();
  const navigate = useNavigate(),
    location = useLocation();
  const close = () => {
    parent.refresh();
    chat?.refresh();
    void navigate(`${parent.back}${location.search}`);
  };
  if (!canManage || !data.data || data.loading)
    return (
      <RouteDialog
        title={$t('onlineAgent.settingsTitle')}
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
              error={data.error}
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
    <SettingsForm
      key={`${data.data.revision}:${reload}`}
      settings={data.data}
      reload={() => setReload((value) => value + 1)}
      close={close}
    />
  );
}
function SettingsForm({
  settings,
  reload,
  close,
}: {
  settings: OnlineChatSettings;
  reload: () => void;
  close: () => void;
}) {
  const api = useOnlineApi();
  const [catalogRevision, setCatalogRevision] = useState(0);
  const catalog = useOnlineResource<Catalog>('models', catalogRevision);
  const [enabled, setEnabled] = useState(settings.enabled),
    [instructions, setInstructions] = useState(settings.instructions);
  const [model, setModel] = useState<OnlineModel | null>(settings.model);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [discard, setDiscard] = useState(false);
  const id = useId();
  const permanent =
    error instanceof OnlineApiError && [401, 403].includes(error.status);
  const unchanged =
    enabled === settings.enabled &&
    instructions === settings.instructions &&
    JSON.stringify(model) === JSON.stringify(settings.model);
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
    setBusy(true);
    setError(undefined);
    try {
      await api<OnlineChatSettings>(
        'settings',
        { enabled, instructions, model, revision: settings.revision },
        'PUT',
      );
      toast.success(() => $t('onlineAgent.settingsSaved'));
      close();
    } catch (failure) {
      if ((failure as Error).name !== 'AbortError') setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <RouteDialog
      title={$t('onlineAgent.settingsTitle')}
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
        <Field orientation='horizontal'>
          <Switch
            id={`${id}-enabled`}
            checked={enabled}
            disabled={busy}
            onCheckedChange={setEnabled}
          />
          <FieldLabel htmlFor={`${id}-enabled`}>
            {$t('onlineAgent.enabledLabel')}
          </FieldLabel>
        </Field>
        <FieldDescription className='-mt-2'>
          {$t('onlineAgent.enabledHelp')}
        </FieldDescription>
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
          title={$t('onlineAgent.discardSettingsTitle')}
          description={$t('onlineAgent.discardDescription')}
          action={$t('onlineAgent.reloadDiscard')}
          busy={false}
          confirm={reload}
        />
      </form>
    </RouteDialog>
  );
}

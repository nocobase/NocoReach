import { useEffect, useId, useState } from 'react';
import { RunnerAgentsSection } from '@nocobase/app-plugin-agents/client/kit';
import { $t, $legacyText, useMessageState } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { Field, FieldDescription, FieldLabel } from '#components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { InlineError, ListSkeleton, LoadError } from '#components/reach/states';
import { useBusinessAccess } from '#hooks/use-business-access';
import { useProject } from '../reach-data.js';
import { AgentsPageLayout } from './index.js';

type Settings = {
  revision: number;
  agentId: string | null;
  options: { id: string; name: string }[];
};
const NONE = '__none__';

export default function RunnerAgents() {
  const { project, error } = useProject();
  return (
    <AgentsPageLayout>
      {error && <InlineError>{error}</InlineError>}
      {project && (
        <DefaultAgent
          key={project.id}
          projectId={project.id}
          projectName={project.name}
        />
      )}
      <RunnerAgentsSection />
    </AgentsPageLayout>
  );
}

function DefaultAgent({
  projectId,
  projectName,
}: {
  projectId: number;
  projectName: string;
}) {
  const { can: canSave } = useBusinessAccess('nrAgent.saveDefault', projectId);
  const id = useId();
  const [data, setData] = useState<Settings>();
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState<Error & { status?: number }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useMessageState('');
  const [notice, setNotice] = useMessageState('');
  useEffect(() => {
    const controller = new AbortController();
    void api
      .action<Settings>('nrAgent', 'status', {
        method: 'POST',
        body: { projectId: String(projectId) },
        signal: controller.signal,
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          setLoadError(undefined);
        }
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setLoadError(e);
      });
    return () => controller.abort();
  }, [projectId, attempt]);

  async function save(value: string | null) {
    if (!data || !value || busy || !canSave || value === (data.agentId || NONE))
      return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await api.action<Pick<Settings, 'revision' | 'agentId'>>(
        'nrAgent',
        'saveDefault',
        {
          method: 'POST',
          body: {
            projectId: String(projectId),
            revision: data.revision,
            agentId: value === NONE ? null : value,
          },
        },
      );
      setData({ ...data, ...saved });
      setNotice(() => $t('runnerDefault.saved'));
    } catch (e) {
      setError(() =>
        e instanceof Error
          ? $legacyText(e.message)
          : $t('runnerDefault.saveFailed'),
      );
      setAttempt((a) => a + 1);
    } finally {
      setBusy(false);
    }
  }

  if (loadError)
    return (
      <LoadError
        title={$t('runnerDefault.loadFailed')}
        message={$legacyText(loadError.message)}
        onRetry={
          !loadError.status || loadError.status >= 500
            ? () => setAttempt((a) => a + 1)
            : undefined
        }
      />
    );
  if (!data) return <ListSkeleton rows={2} />;
  const unavailable = Boolean(
    data.agentId && !data.options.some((a) => a.id === data.agentId),
  );
  const items = [
    { value: NONE, label: $t('runnerDefault.none') },
    ...data.options.map((a) => ({ value: a.id, label: a.name })),
    ...(unavailable
      ? [
          {
            value: data.agentId!,
            label: $t('taskDetail.unavailable', { 0: data.agentId! }),
          },
        ]
      : []),
  ];
  return (
    <Field className='min-w-0 rounded-lg border p-4'>
      <FieldLabel htmlFor={id}>{$t('runnerDefault.title')}</FieldLabel>
      <FieldDescription id={`${id}-help`}>
        {$t('runnerDefault.description', { 0: projectName })}
      </FieldDescription>
      <Select
        items={items}
        value={data.agentId || NONE}
        disabled={!canSave || busy}
        onValueChange={(value) => void save(value)}
      >
        <SelectTrigger
          id={id}
          aria-describedby={`${id}-help`}
          className='w-full min-w-0 sm:max-w-sm'
        >
          <SelectValue className='truncate' />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
                disabled={unavailable && item.value === data.agentId}
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {error && <InlineError>{error}</InlineError>}
      <span role='status' className='text-sm text-muted-foreground'>
        {busy ? $t('common.saving') : notice}
      </span>
    </Field>
  );
}

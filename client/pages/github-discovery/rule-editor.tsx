import { useNavigationGuard, usePageBreadcrumb } from '@nocobase/app-client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router';
import { $t, useNocoReachLocale } from '#i18n';
import { RouteChildPage } from '#components/route-child-page';
import { PageContainer, PageHeader, Section } from '#components/reach/page';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';
import { Label } from '#components/ui/label';
import { Checkbox } from '#components/ui/checkbox';
import { ListSkeleton, LoadError, InlineError } from '#components/reach/states';
import { InfoTip } from '#components/reach/info-tip';
import { confirmAction } from '#components/reach/confirm';
import { useBusinessAccess } from '#hooks/use-business-access';
import { NocoReachHttpError } from '#lib/nocoreach-api';
import { toast } from '#lib/toast';
import { useProject } from '../reach-data.js';
import {
  discoveryRequest,
  newDiscoveryRule,
  retryable,
  type DiscoveryRule,
  type DiscoveryStatus,
  type DiscoveredRepository,
} from './api.js';
import { formOf, parseForm, type RuleForm } from './rule-form.js';
import { DetectionBadge, DiscoverySelect } from './components.js';

export default function RuleEditor() {
  useNocoReachLocale();
  const { project } = useProject(),
    { ruleId } = useParams();
  return project && ruleId ? (
    <Editor
      key={`${project.id}:${ruleId}`}
      projectId={project.id}
      ruleId={ruleId}
    />
  ) : null;
}
function Editor({ projectId, ruleId }: { projectId: number; ruleId: string }) {
  const location = useLocation(),
    navigate = useNavigate();
  const params = new URLSearchParams(location.search),
    preset = params.get('preset') === 'nocobase3';
  params.delete('preset');
  const back = `/connections?${params}`;
  const { can } = useBusinessAccess('nrGitHubDiscovery.saveRule', projectId);
  const { can: canPreview } = useBusinessAccess(
    'nrGitHubDiscovery.preview',
    projectId,
  );
  const [status, setStatus] = useState<DiscoveryStatus>(),
    [rule, setRule] = useState<DiscoveryRule>(),
    [form, setForm] = useState<RuleForm>();
  const [error, setError] = useState<unknown>(),
    [failure, setFailure] = useState(''),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(''),
    [tried, setTried] = useState(false);
  const [preview, setPreview] = useState<DiscoveredRepository[]>();
  const originalRef = useRef(''),
    aliveRef = useRef(true),
    savedRef = useRef(false),
    formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void discoveryRequest<DiscoveryStatus>(
      projectId,
      'status',
      {},
      { signal: controller.signal },
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        const next =
          ruleId === 'new'
            ? newDiscoveryRule(preset)
            : data.rules.find((r) => r.id === ruleId);
        if (!next)
          throw new NocoReachHttpError(
            $t('githubDiscovery.missing'),
            404,
            null,
          );
        setError(undefined);
        setStatus(data);
        setRule(next);
        setForm(formOf(next));
        originalRef.current = JSON.stringify(formOf(next));
        setFailure('');
        setTried(false);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e);
      });
    return () => controller.abort();
  }, [projectId, ruleId, preset, version]);
  usePageBreadcrumb([
    { label: $t('sourceConnections.dataSources'), to: back },
    {
      label: $t(
        ruleId === 'new'
          ? 'githubDiscovery.addRule'
          : 'githubDiscovery.editRule',
      ),
    },
  ]);
  useNavigationGuard(async () => {
    if (savedRef.current) return true;
    if (busy) return false;
    if (
      savedRef.current ||
      !form ||
      JSON.stringify(form) === originalRef.current
    )
      return true;
    return confirmAction({
      title: () => $t('common.discardUnsavedChanges'),
      description: () => $t('common.unsavedChangesLost'),
      action: 'common.discard',
    });
  });
  const validation = form && rule ? parseForm(form, rule) : null;
  const invalid = tried ? validation?.invalid || [] : [];
  function change<K extends keyof RuleForm>(key: K, value: RuleForm[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setPreview(undefined);
  }
  async function submit(event: FormEvent | undefined, action = 'saveRule') {
    event?.preventDefault();
    setTried(true);
    if (!validation?.rule || !status || busy) {
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      );
      return;
    }
    setBusy(action);
    setFailure('');
    try {
      if (action === 'preview') {
        const result = await discoveryRequest<{
          items: DiscoveredRepository[];
        }>(projectId, action, { rule: validation.rule });
        if (aliveRef.current) {
          setPreview(result.items);
          toast.success(() => $t('githubDiscovery.previewReady'));
        }
      } else {
        await discoveryRequest(projectId, action, {
          rule: validation.rule,
          revision: status.revision,
        });
        if (aliveRef.current) {
          savedRef.current = true;
          toast.success(() => $t('common.saved'));
          setBusy('');
          void navigate(back);
        }
      }
    } catch (e) {
      if (aliveRef.current)
        setFailure(
          e instanceof Error ? e.message : $t('common.operationFailedRetry'),
        );
    } finally {
      if (aliveRef.current) setBusy('');
    }
  }
  const field = (
    key: 'name' | 'queries' | 'dependencies' | 'files' | 'json' | 'exclusions',
    required = false,
  ) => (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center gap-1'>
        <Label htmlFor={`rule-${key}`}>
          {$t(key === 'name' ? 'common.name' : `githubDiscovery.${key}`)}
          {required ? ' *' : ''}
        </Label>
        <InfoTip>
          {key === 'name'
            ? $t('common.characters', { 0: '1–100' })
            : $t(`githubDiscovery.${key}Help`)}
        </InfoTip>
      </div>
      {key === 'name' ? (
        <Input
          id={`rule-${key}`}
          value={form?.[key] || ''}
          onChange={(e) => change(key, e.target.value)}
          aria-invalid={invalid.includes(key)}
          aria-describedby={invalid.includes(key) ? `${key}-error` : undefined}
        />
      ) : (
        <Textarea
          id={`rule-${key}`}
          value={form?.[key] || ''}
          onChange={(e) => change(key, e.target.value)}
          rows={4}
          aria-invalid={invalid.includes(key)}
          aria-describedby={invalid.includes(key) ? `${key}-error` : undefined}
        />
      )}
      {invalid.includes(key) && (
        <p id={`${key}-error`} className='text-sm text-destructive'>
          {$t('githubDiscovery.fieldInvalid')}
        </p>
      )}
    </div>
  );
  return (
    <RouteChildPage>
      <PageContainer>
        <PageHeader
          title={$t(
            ruleId === 'new'
              ? 'githubDiscovery.addRule'
              : 'githubDiscovery.editRule',
          )}
          description={$t('githubDiscovery.rulesHelp')}
        />
        {!can ? (
          <InlineError>{$t('accessMembers.errors.denied')}</InlineError>
        ) : error ? (
          <LoadError
            title={$t('githubDiscovery.loadFailed')}
            message={error instanceof Error ? error.message : undefined}
            onRetry={
              retryable(error) ? () => setVersion((v) => v + 1) : undefined
            }
          />
        ) : !form || !rule || !status ? (
          <ListSkeleton />
        ) : (
          <form
            ref={formRef}
            noValidate
            onSubmit={(e) => void submit(e)}
            className='flex flex-col gap-4'
          >
            {failure && (
              <InlineError
                action={
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => {
                      void (async () => {
                        if (
                          await confirmAction({
                            title: () => $t('common.discardUnsavedChanges'),
                            description: () => $t('common.unsavedChangesLost'),
                            action: 'githubDiscovery.reload',
                          })
                        )
                          setVersion((v) => v + 1);
                      })();
                    }}
                  >
                    {$t('githubDiscovery.reload')}
                  </Button>
                }
              >
                {failure}
              </InlineError>
            )}
            <fieldset disabled={!!busy} className='flex min-w-0 flex-col gap-4'>
              <Section title={$t('githubDiscovery.candidates')}>
                <div className='grid gap-4 md:grid-cols-2'>
                  {field('name', true)}
                  {field('queries', true)}
                </div>
              </Section>
              <Section
                title={$t('githubDiscovery.evidence')}
                description={$t('githubDiscovery.evidenceHelp')}
              >
                <div className='grid gap-4 lg:grid-cols-3'>
                  {field('dependencies')}
                  {field('files')}
                  {field('json')}
                </div>
              </Section>
              <Section title={$t('githubDiscovery.scope')}>
                <div className='grid gap-4 md:grid-cols-2'>
                  {field('exclusions')}
                  <div className='flex flex-col gap-4'>
                    {(
                      [
                        'includeForks',
                        'includeArchived',
                        'includeTemplates',
                      ] as const
                    ).map((key) => (
                      <div key={key} className='flex items-center gap-2'>
                        <Checkbox
                          id={key}
                          checked={form[key]}
                          onCheckedChange={(checked) => change(key, checked)}
                        />
                        <Label htmlFor={key}>
                          {$t(`githubDiscovery.${key}`)}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
              <Section title={$t('githubDiscovery.collection')}>
                <div className='flex flex-wrap gap-4'>
                  <div className='flex flex-col gap-2'>
                    <Label>{$t('githubDiscovery.frequency')}</Label>
                    <DiscoverySelect
                      label={$t('githubDiscovery.frequency')}
                      value={String(form.intervalHours)}
                      options={[
                        { value: '24', label: $t('githubDiscovery.daily') },
                        { value: '168', label: $t('githubDiscovery.weekly') },
                      ]}
                      onChange={(v) => change('intervalHours', Number(v))}
                    />
                  </div>
                  <div className='flex flex-col gap-2'>
                    <Label htmlFor='rule-batchSize'>
                      {$t('githubDiscovery.batchSize')} *
                      <InfoTip>
                        {$t('analysisRules.between', {
                          0: $t('githubDiscovery.batchSize'),
                          1: 5,
                          2: 50,
                        })}
                      </InfoTip>
                    </Label>
                    <Input
                      id='rule-batchSize'
                      type='number'
                      min={5}
                      max={50}
                      value={form.batchSize}
                      onChange={(e) =>
                        change('batchSize', Number(e.target.value))
                      }
                      aria-invalid={invalid.includes('batchSize')}
                      aria-describedby={
                        invalid.includes('batchSize')
                          ? 'batchSize-error'
                          : undefined
                      }
                    />
                    {invalid.includes('batchSize') && (
                      <p
                        id='batchSize-error'
                        className='text-sm text-destructive'
                      >
                        {$t('githubDiscovery.fieldInvalid')}
                      </p>
                    )}
                  </div>
                </div>
              </Section>
            </fieldset>
            {preview && (
              <Section
                title={$t('githubDiscovery.preview')}
                description={$t('githubDiscovery.previewHelp')}
              >
                {!preview.length ? (
                  <p>{$t('common.noResults')}</p>
                ) : (
                  <ul className='flex flex-col gap-3'>
                    {preview.map((r) => (
                      <li key={r.id} className='flex flex-col gap-1'>
                        <a
                          href={r.url}
                          target='_blank'
                          rel='noreferrer'
                          className='break-all hover:underline'
                        >
                          {r.name}
                        </a>
                        <DetectionBadge status={r.matches[0].status} />
                        {r.matches[0].evidence.map((e) => (
                          <a
                            key={`${e.path}:${e.field || ''}:${e.expected}`}
                            href={e.url}
                            target='_blank'
                            rel='noreferrer'
                            className='break-all text-sm hover:underline'
                          >
                            {e.path}
                            {e.field ? ` · ${e.field}` : ''} · {e.actual ?? '—'}{' '}
                            ·{' '}
                            {$t(
                              e.matched
                                ? 'githubDiscovery.matched'
                                : 'githubDiscovery.unmatched',
                            )}
                          </a>
                        ))}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            )}
            <div className='flex flex-wrap justify-end gap-2'>
              <Button
                type='button'
                variant='outline'
                disabled={!!busy}
                onClick={() => void navigate(back)}
              >
                {$t('common.cancel')}
              </Button>
              {canPreview && (
                <Button
                  type='button'
                  variant='outline'
                  disabled={
                    !!busy || status.credential === 'missing' || status.running
                  }
                  onClick={() => void submit(undefined, 'preview')}
                >
                  {busy === 'preview'
                    ? $t('githubDiscovery.scanning')
                    : $t('githubDiscovery.preview')}
                </Button>
              )}
              <Button type='submit' disabled={!!busy}>
                {busy === 'saveRule' ? $t('common.saving') : $t('common.save')}
              </Button>
            </div>
            {canPreview &&
              (status.credential === 'missing' || status.running) && (
                <p className='text-sm text-muted-foreground'>
                  {$t(
                    status.credential === 'missing'
                      ? 'githubDiscovery.tokenNeeded'
                      : 'githubDiscovery.busy',
                  )}
                </p>
              )}
          </form>
        )}
        {Boolean(error) && <Link to={back}>{$t('common.cancel')}</Link>}
      </PageContainer>
    </RouteChildPage>
  );
}

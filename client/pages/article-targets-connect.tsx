import { useCallback, useEffect, useId, useState } from 'react';
import { MoreHorizontal, Send } from 'lucide-react';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { $t, getCurrentLocale, useNocoReachLocale } from '#i18n';
import { toast } from '#lib/toast';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';
import { Badge } from '#components/ui/badge';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '#components/ui/field';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { confirmAction } from '#components/reach/confirm';
import { useBusinessAccess } from '#hooks/use-business-access';
import {
  ARTICLE_TARGET_KINDS,
  ARTICLE_TARGET_PRESETS,
  type ArticleTargetKind,
  type ArticleTargetView,
} from '../../shared/article-publishing.js';
import {
  articleRequest,
  errorKey,
  errorStatus,
  localeName,
  providerKey,
  type TargetList,
  type TestResult,
} from './article-targets-api';

// Data sources › Article publishing (docs/ARTICLE-PUBLISHING.md). One card per target, edited in place and saved on
// its own; one card edits at a time. Languages, field mapping, page templates and the Git export are edited as JSON:
// they differ per target kind and the presets fill them in. Credentials are write-only.

type Props = {
  projectId: number;
  onChange: () => void;
  onSavingChange: (saving: boolean) => void;
};
const kindKey: Record<ArticleTargetKind, string> = {
  'nocobase-api': 'articlePublishing.kind.nocobaseApi',
  http: 'articlePublishing.kind.http',
  'git-files': 'articlePublishing.kind.gitFiles',
};
const BASIC = [
  'id',
  'name',
  'kind',
  'baseUrl',
  'repo',
  'branch',
  'hasSecret',
  'capabilities',
];
const advancedOf = (t: object) =>
  JSON.stringify(
    Object.fromEntries(Object.entries(t).filter(([k]) => !BASIC.includes(k))),
    null,
    2,
  );
const slugOf = (name: string) =>
  `${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'target'
  }-${Math.random().toString(36).slice(2, 6)}`;

type Form = {
  id: string;
  isNew: boolean;
  name: string;
  kind: ArticleTargetKind;
  baseUrl: string;
  repo: string;
  branch: string;
  secret: string;
  gitToken: string;
  advanced: string;
  touched: boolean;
  hasSecret: boolean;
};
const formFor = (t?: ArticleTargetView): Form => {
  if (!t) {
    const preset = ARTICLE_TARGET_PRESETS['nocobase-api'];
    return {
      id: '',
      isNew: true,
      name: '',
      kind: 'nocobase-api',
      baseUrl: '',
      repo: '',
      branch: 'main',
      secret: '',
      gitToken: '',
      advanced: advancedOf(preset),
      touched: false,
      hasSecret: false,
    };
  }
  return {
    id: t.id,
    isNew: false,
    name: t.name,
    kind: t.kind,
    baseUrl: 'baseUrl' in t ? t.baseUrl : '',
    repo: 'repo' in t ? t.repo : '',
    branch: 'branch' in t ? t.branch : 'main',
    secret: '',
    gitToken: '',
    advanced: advancedOf(t),
    touched: false,
    hasSecret: t.hasSecret,
  };
};
const parsed = (text: string): Record<string, unknown> | null => {
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

export function ArticleTargetsConnect(props: Props) {
  const { session, isPending } = useAuthentication();
  if (isPending || !session) return null;
  return (
    <TargetsPanel
      key={`${props.projectId}:${session.session.id}`}
      {...props}
      sessionId={session.session.id}
    />
  );
}

function TargetsPanel({
  projectId,
  onChange,
  onSavingChange,
  sessionId,
}: Props & { sessionId: string }) {
  useNocoReachLocale();
  const id = useId();
  const { can: canSave } = useBusinessAccess(
    'nrArticles.saveTarget',
    projectId,
  );
  const { can: canRemove } = useBusinessAccess(
    'nrArticles.removeTarget',
    projectId,
  );
  const { can: canTest } = useBusinessAccess(
    'nrArticles.testTarget',
    projectId,
  );
  const { can: canSetDefault } = useBusinessAccess(
    'nrArticles.setDefaultTarget',
    projectId,
  );
  const [list, setList] = useState<TargetList>();
  const [loadError, setLoadError] = useState<{ key: string; retry: boolean }>();
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<
    Partial<
      Record<
        'name' | 'address' | 'repo' | 'branch' | 'secret' | 'advanced',
        string
      >
    >
  >({});
  const [formError, setFormError] = useState<{
    key: string;
    stale?: boolean;
  }>();
  const [busy, setBusy] = useState<string>('');
  // After a failed save, fields revalidate as they change (T3.3).
  const [submitted, setSubmitted] = useState(false);
  const focusLater = (key: string) =>
    setTimeout(() => document.getElementById(`${id}-${key}`)?.focus(), 0);
  const load = useCallback(async () => {
    try {
      const next = await articleRequest<TargetList>('targets', projectId);
      setList(next);
      setLoadError(undefined);
      return next;
    } catch (e) {
      const status = errorStatus(e);
      setLoadError({
        key:
          status === 403
            ? 'articlePublishing.noAccess'
            : errorKey(e) === 'articles.unreadable'
              ? 'articles.unreadable'
              : 'articlePublishing.loadFailed',
        retry: status !== 403 && errorKey(e) !== 'articles.unreadable',
      });
      return undefined;
    }
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function run<T>(owner: string, fn: () => Promise<T>) {
    setBusy(owner);
    onSavingChange(true);
    try {
      return await fn();
    } finally {
      setBusy('');
      onSavingChange(false);
    }
  }
  const update = (patch: Partial<Form>) =>
    setForm((f) => (f ? { ...f, ...patch } : f));
  async function startEdit(t?: ArticleTargetView) {
    setErrors({});
    setFormError(undefined);
    setSubmitted(false);
    if (!t) {
      setForm(formFor());
      focusLater('name');
      return;
    }
    // Edit from the latest saved settings, not the list on screen (T3.8). A failed reload shows the load Alert.
    const fresh = await run(`edit-${t.id}`, load);
    if (!fresh) return;
    const current = fresh.targets.find((x) => x.id === t.id);
    if (!current) {
      toast.error(() => $t('articles.targetMissing'));
      return;
    }
    setForm(formFor(current));
    focusLater('name');
  }
  async function changeKind(kind: ArticleTargetKind) {
    if (!form || kind === form.kind) return;
    if (
      form.touched &&
      !(await confirmAction({
        title: () => $t('articlePublishing.replaceTitle'),
        description: () => $t('articlePublishing.replaceDescription'),
        action: () => $t('articlePublishing.replace'),
        destructive: false,
      }))
    )
      return;
    update({
      kind,
      advanced: advancedOf(ARTICLE_TARGET_PRESETS[kind]),
      touched: false,
    });
  }
  function validate(f: Form) {
    const next: typeof errors = {};
    if (!f.name.trim()) next.name = 'articlePublishing.nameRequired';
    if (f.kind === 'git-files') {
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(f.repo.trim()))
        next.repo = 'articlePublishing.repoInvalid';
      if (!f.branch.trim()) next.branch = 'articlePublishing.branchRequired';
    } else if (!/^https:\/\/[^\s]+$/.test(f.baseUrl.trim()))
      next.address = 'articlePublishing.urlInvalid';
    if (!parsed(f.advanced)) next.advanced = 'articlePublishing.jsonInvalid';
    return next;
  }
  async function save() {
    if (!form || !list) return;
    const found = validate(form);
    setErrors(found);
    setSubmitted(true);
    setFormError(undefined);
    const first = (
      ['name', 'address', 'repo', 'branch', 'advanced'] as const
    ).find((k) => found[k]);
    if (first) return focusLater(first);
    const advanced = parsed(form.advanced) || {};
    const target = {
      ...advanced,
      id: form.id || slugOf(form.name),
      name: form.name.trim(),
      kind: form.kind,
      ...(form.kind === 'git-files'
        ? { repo: form.repo.trim(), branch: form.branch.trim() }
        : { baseUrl: form.baseUrl.trim().replace(/\/+$/, '') }),
    };
    await run('save', async () => {
      try {
        const next = await articleRequest<TargetList>(
          'saveTarget',
          projectId,
          {
            revision: list.revision,
            target,
            ...(form.secret ? { secret: form.secret } : {}),
            ...(form.gitToken ? { gitToken: form.gitToken } : {}),
          },
          sessionId,
        );
        setList(next);
        setForm(null);
        toast.success(() => $t('articlePublishing.saved', { 0: target.name }));
        onChange();
        focusLater(`edit-${target.id}`);
      } catch (e) {
        const key = errorKey(e);
        if (
          key === 'articles.secretRequired' ||
          key === 'articles.secretForNewEndpoint' ||
          key === 'articles.invalidSecret'
        ) {
          setErrors({ secret: key });
          focusLater('secret');
        } else if (
          key === 'articles.invalidTarget' ||
          key === 'articles.invalidLocale'
        ) {
          setErrors({ advanced: key });
          focusLater('advanced');
        } else if (key === 'articles.stale')
          setFormError({ key: 'articlePublishing.stale', stale: true });
        else
          setFormError({
            key:
              e instanceof Error && key
                ? key
                : errorStatus(e) === 409 || errorStatus(e) === 403
                  ? (e as Error).message
                  : 'articlePublishing.saveFailed',
          });
      }
    });
  }
  function cancel() {
    const was = form;
    setForm(null);
    setErrors({});
    setFormError(undefined);
    focusLater(was?.isNew ? 'new' : `edit-${was?.id}`);
  }
  async function test(t: ArticleTargetView) {
    await run(`test-${t.id}`, async () => {
      try {
        const r = await articleRequest<TestResult>(
          'testTarget',
          projectId,
          { targetId: t.id },
          sessionId,
        );
        if (r.ok)
          toast.success(() =>
            r.sample
              ? $t('articlePublishing.testOk', { 0: r.sample.title })
              : $t('articlePublishing.testOkEmpty'),
          );
        else
          toast.error(() =>
            $t(providerKey(r.code)) === providerKey(r.code)
              ? $t('articlePublishing.testFailed')
              : $t(providerKey(r.code)),
          );
      } catch (e) {
        toast.error(() =>
          e instanceof Error ? e.message : $t('articlePublishing.testFailed'),
        );
      }
    });
  }
  async function makeDefault(t: ArticleTargetView) {
    if (!list) return;
    await run(`default-${t.id}`, async () => {
      try {
        const next = await articleRequest<TargetList>(
          'setDefaultTarget',
          projectId,
          { revision: list.revision, id: t.id },
          sessionId,
        );
        setList(next);
        toast.success(() => $t('articlePublishing.defaultSet', { 0: t.name }));
        onChange();
      } catch (e) {
        toast.error(() =>
          e instanceof Error ? e.message : $t('common.operationFailedRetry'),
        );
        if (
          errorKey(e) === 'articles.targetMissing' ||
          errorKey(e) === 'articles.stale'
        )
          void load();
      }
    });
  }
  async function remove(t: ArticleTargetView) {
    if (!list) return;
    if (
      !(await confirmAction({
        title: () => $t('articlePublishing.deleteTitle', { 0: t.name }),
        description: () => $t('articlePublishing.deleteDescription'),
        action: () => $t('articlePublishing.delete'),
      }))
    )
      return;
    await run(`remove-${t.id}`, async () => {
      try {
        const next = await articleRequest<TargetList>(
          'removeTarget',
          projectId,
          { revision: list.revision, id: t.id },
          sessionId,
        );
        setList(next);
        toast.success(() => $t('articlePublishing.deleted', { 0: t.name }));
        onChange();
        focusLater('new');
      } catch (e) {
        toast.error(() =>
          e instanceof Error ? e.message : $t('common.operationFailedRetry'),
        );
        if (
          errorKey(e) === 'articles.targetMissing' ||
          errorKey(e) === 'articles.stale'
        )
          void load();
      }
    });
  }

  if (!list)
    return loadError ? (
      <Alert variant='destructive'>
        <AlertDescription>
          {$t(loadError.key)}{' '}
          {loadError.retry && (
            <Button variant='outline' size='sm' onClick={() => void load()}>
              {$t('common.retry')}
            </Button>
          )}
        </AlertDescription>
      </Alert>
    ) : (
      <div
        role='status'
        aria-label={$t('common.loadingLoading')}
        className='flex flex-col gap-4'
      >
        <Skeleton className='h-32 w-full' />
        <Skeleton className='h-32 w-full' />
      </div>
    );
  const editing = Boolean(form);
  const locked = (child: React.ReactElement) =>
    editing ? (
      <Tooltip>
        <TooltipTrigger render={<span tabIndex={0}>{child}</span>} />
        <TooltipContent>{$t('articlePublishing.finishEditing')}</TooltipContent>
      </Tooltip>
    ) : (
      child
    );
  const disabled = Boolean(busy) || editing;
  const editor = form && (
    <EditCard
      id={id}
      form={form}
      errors={errors}
      formError={formError}
      busy={busy === 'save'}
      update={(patch) => {
        update(patch);
        // Client checks run again on every change after a failed save; a server error on the key stays until
        // the key itself changes.
        if (submitted)
          setErrors((old) => ({
            ...validate({ ...form, ...patch }),
            ...(old.secret && !('secret' in patch)
              ? { secret: old.secret }
              : {}),
          }));
      }}
      changeKind={(k) => void changeKind(k)}
      onSave={() => void save()}
      onCancel={cancel}
      onReload={() =>
        void load().then((next) => {
          if (next) setFormError(undefined);
        })
      }
    />
  );
  return (
    <div className='flex flex-col gap-4'>
      {loadError && (
        <Alert variant='destructive'>
          <AlertDescription>
            {$t(loadError.key)}{' '}
            {loadError.retry && (
              <Button variant='outline' size='sm' onClick={() => void load()}>
                {$t('common.retry')}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {form?.isNew && editor}
      {list.targets.length === 0 && !form ? (
        <Empty className='min-h-40 border border-dashed p-6 md:p-6'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <Send />
            </EmptyMedia>
            <EmptyTitle>{$t('articlePublishing.emptyTitle')}</EmptyTitle>
            <EmptyDescription>
              {canSave
                ? $t('articlePublishing.emptyDescription')
                : $t('articlePublishing.askAdmin')}
            </EmptyDescription>
          </EmptyHeader>
          {canSave && (
            <EmptyContent>
              <Button id={`${id}-new`} onClick={() => void startEdit()}>
                {$t('articlePublishing.newTarget')}
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : null}
      {list.targets.map((t) =>
        form && !form.isNew && form.id === t.id ? (
          <div key={t.id}>{editor}</div>
        ) : (
          <Card key={t.id} size='sm'>
            <CardHeader>
              <CardTitle className='flex flex-wrap items-center gap-2'>
                {t.name}
                <Badge variant='secondary'>{$t(kindKey[t.kind])}</Badge>
                {t.id === list.defaultTargetId && (
                  <Badge>{$t('articlePublishing.default')}</Badge>
                )}
              </CardTitle>
              <CardDescription className='break-all'>
                {t.kind === 'git-files' ? `${t.repo} · ${t.branch}` : t.baseUrl}
              </CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-1 text-sm text-muted-foreground'>
              <p>
                {$t('articlePublishing.languages', {
                  0: t.locales
                    .map((l) => localeName(l, getCurrentLocale()))
                    .join(getCurrentLocale().startsWith('zh') ? '、' : ', '),
                })}
              </p>
              {t.kind !== 'git-files' && t.downstream && (
                <p className='break-all'>
                  {$t('articlePublishing.exportsTo', {
                    0: t.downstream.repo,
                    1: t.downstream.branch,
                  })}
                </p>
              )}
              <p>
                {$t(
                  t.capabilities.concurrency === 'conditional'
                    ? 'articlePublishing.conditional'
                    : 'articlePublishing.checkBeforeWrite',
                )}
              </p>
            </CardContent>
            <CardFooter className='flex flex-wrap justify-end gap-2'>
              {canTest &&
                locked(
                  <Button
                    variant='outline'
                    disabled={disabled}
                    onClick={() => void test(t)}
                  >
                    {busy === `test-${t.id}` && (
                      <Spinner data-icon='inline-start' />
                    )}
                    {$t('articlePublishing.test')}
                  </Button>,
                )}
              {canSave &&
                locked(
                  <Button
                    id={`${id}-edit-${t.id}`}
                    variant='outline'
                    disabled={disabled}
                    onClick={() => void startEdit(t)}
                  >
                    {busy === `edit-${t.id}` && (
                      <Spinner data-icon='inline-start' />
                    )}
                    {$t('articlePublishing.edit')}
                  </Button>,
                )}
              {(canRemove ||
                (canSetDefault && t.id !== list.defaultTargetId)) &&
                locked(
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant='ghost'
                          size='icon'
                          aria-label={$t('articlePublishing.actions', {
                            0: t.name,
                          })}
                          disabled={disabled}
                        />
                      }
                    >
                      {busy === `remove-${t.id}` ||
                      busy === `default-${t.id}` ? (
                        <Spinner />
                      ) : (
                        <MoreHorizontal />
                      )}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align='end'
                      className='w-auto min-w-40'
                    >
                      {canSetDefault && t.id !== list.defaultTargetId && (
                        <DropdownMenuItem onClick={() => void makeDefault(t)}>
                          {$t('articlePublishing.setDefault')}
                        </DropdownMenuItem>
                      )}
                      {canRemove &&
                        canSetDefault &&
                        t.id !== list.defaultTargetId && (
                          <DropdownMenuSeparator />
                        )}
                      {canRemove && (
                        <DropdownMenuItem
                          variant='destructive'
                          onClick={() => void remove(t)}
                        >
                          {$t('articlePublishing.delete')}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>,
                )}
            </CardFooter>
          </Card>
        ),
      )}
      {list.targets.length > 0 && canSave && (
        <div>
          {locked(
            <Button
              id={`${id}-new`}
              variant='outline'
              disabled={disabled}
              onClick={() => void startEdit()}
            >
              {$t('articlePublishing.newTarget')}
            </Button>,
          )}
        </div>
      )}
    </div>
  );
}

function EditCard({
  id,
  form,
  errors,
  formError,
  busy,
  update,
  changeKind,
  onSave,
  onCancel,
  onReload,
}: {
  id: string;
  form: Form;
  errors: Partial<Record<string, string>>;
  formError?: { key: string; stale?: boolean };
  busy: boolean;
  update: (patch: Partial<Form>) => void;
  changeKind: (k: ArticleTargetKind) => void;
  onSave: () => void;
  onCancel: () => void;
  onReload: () => void;
}) {
  const advanced = parsed(form.advanced);
  const downstream = Boolean(advanced && advanced.downstream);
  const err = (key: string) =>
    errors[key] ? (
      <FieldError id={`${id}-${key}-error`}>{$t(errors[key])}</FieldError>
    ) : null;
  const aria = (key: string) => ({
    'aria-invalid': Boolean(errors[key]),
    'aria-describedby': errors[key] ? `${id}-${key}-error` : undefined,
  });
  return (
    <Card size='sm'>
      <CardHeader>
        <CardTitle>
          {form.isNew
            ? $t('articlePublishing.newTarget')
            : form.name || $t('articlePublishing.name')}
        </CardTitle>
        <CardDescription>
          {$t('articlePublishing.advancedHelp')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className='flex flex-col gap-4'
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <fieldset disabled={busy} className='flex flex-col gap-4'>
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor={`${id}-name`}>
                {$t('articlePublishing.name')} *
              </FieldLabel>
              <Input
                id={`${id}-name`}
                value={form.name}
                maxLength={60}
                onChange={(e) => update({ name: e.target.value })}
                {...aria('name')}
              />
              {err('name')}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-kind`}>
                {$t('articlePublishing.kind')} *
              </FieldLabel>
              {form.isNew ? (
                <Select
                  value={form.kind}
                  onValueChange={(v) => changeKind(v as ArticleTargetKind)}
                >
                  <SelectTrigger id={`${id}-kind`} className='w-full'>
                    <SelectValue>
                      {(v: string) => $t(kindKey[v as ArticleTargetKind])}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
                    {ARTICLE_TARGET_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {$t(kindKey[k])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p id={`${id}-kind`} className='text-sm'>
                  {$t(kindKey[form.kind])}
                </p>
              )}
            </Field>
            {form.kind === 'git-files' ? (
              <>
                <Field data-invalid={Boolean(errors.repo)}>
                  <FieldLabel htmlFor={`${id}-repo`}>
                    {$t('articlePublishing.repository')} *
                  </FieldLabel>
                  <Input
                    id={`${id}-repo`}
                    value={form.repo}
                    placeholder='owner/website'
                    onChange={(e) => update({ repo: e.target.value })}
                    {...aria('repo')}
                  />
                  {err('repo')}
                </Field>
                <Field data-invalid={Boolean(errors.branch)}>
                  <FieldLabel htmlFor={`${id}-branch`}>
                    {$t('articlePublishing.branch')} *
                  </FieldLabel>
                  <Input
                    id={`${id}-branch`}
                    value={form.branch}
                    onChange={(e) => update({ branch: e.target.value })}
                    {...aria('branch')}
                  />
                  {err('branch')}
                </Field>
              </>
            ) : (
              <Field data-invalid={Boolean(errors.address)}>
                <FieldLabel htmlFor={`${id}-address`}>
                  {$t('articlePublishing.address')} *
                </FieldLabel>
                <Input
                  id={`${id}-address`}
                  value={form.baseUrl}
                  placeholder='https://cms.example.com'
                  onChange={(e) => update({ baseUrl: e.target.value })}
                  {...aria('address')}
                />
                {err('address')}
              </Field>
            )}
            <Field data-invalid={Boolean(errors.secret)}>
              <FieldLabel htmlFor={`${id}-secret`}>
                {$t('articlePublishing.secret')}
                {form.hasSecret ? '' : ' *'}
              </FieldLabel>
              <Input
                id={`${id}-secret`}
                type='password'
                autoComplete='off'
                value={form.secret}
                onChange={(e) => update({ secret: e.target.value })}
                {...aria('secret')}
              />
              {form.hasSecret && (
                <FieldDescription>
                  {$t('articlePublishing.secretSaved')}
                </FieldDescription>
              )}
              {err('secret')}
            </Field>
            {downstream && form.kind !== 'git-files' && (
              <Field>
                <FieldLabel htmlFor={`${id}-git-token`}>
                  {$t('articlePublishing.gitToken')}
                </FieldLabel>
                <Input
                  id={`${id}-git-token`}
                  type='password'
                  autoComplete='off'
                  value={form.gitToken}
                  onChange={(e) => update({ gitToken: e.target.value })}
                />
                <FieldDescription>
                  {$t('articlePublishing.gitTokenHelp')}
                </FieldDescription>
              </Field>
            )}
            <Field data-invalid={Boolean(errors.advanced)}>
              <FieldLabel htmlFor={`${id}-advanced`}>
                {$t('articlePublishing.advanced')} *
              </FieldLabel>
              <Textarea
                id={`${id}-advanced`}
                rows={14}
                spellCheck={false}
                className='field-sizing-fixed font-mono text-xs'
                value={form.advanced}
                onChange={(e) =>
                  update({ advanced: e.target.value, touched: true })
                }
                {...aria('advanced')}
              />
              <FieldDescription>
                {$t('articlePublishing.advancedHelp')}
              </FieldDescription>
              {err('advanced')}
            </Field>
          </fieldset>
          {formError && (
            <Alert variant='destructive'>
              <AlertDescription>
                {$t(formError.key)}{' '}
                {formError.stale && (
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={onReload}
                  >
                    {$t('articlePublishing.reload')}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          <div className='flex flex-wrap justify-end gap-2'>
            <Button
              type='button'
              variant='ghost'
              disabled={busy}
              onClick={onCancel}
            >
              {$t('common.cancel')}
            </Button>
            <Button type='submit' disabled={busy}>
              {busy && <Spinner data-icon='inline-start' />}
              {$t('common.save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

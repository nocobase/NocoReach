import { useCallback, useEffect, useId, useState } from 'react';
import { Plus } from 'lucide-react';
import { $t, getCurrentLocale, useMessageState } from '#i18n';
import { NocoReachHttpError } from '#lib/nocoreach-api';
import { formatDate, formatDateTime } from '#lib/format';
import { toast } from '#lib/toast';
import { cn } from '#lib/utils';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '#components/ui/field';
import { Input } from '#components/ui/input';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import { chipButtonClass, chipClass } from '#components/reach/chip';
import { confirmAction } from '#components/reach/confirm';
import { Tag, type Tone } from '#components/reach/tag';
import { useBusinessAccess } from '#hooks/use-business-access';
import { repoUrlKey, urlOwner } from '../../shared/repo-routing.js';
import { StatusCard, StatusRow } from './connection-status-card';
import { agentRequest, type RepoList } from './repo-connect-api';

// Data sources › Website source (2026-10-29, ui-references/repos-2026-10-29/multi-repo.png): a status card for each
// repository (the addresses it serves, its branch, its latest check and the pull request the Agent last opened there),
// then Connect another repository. Adding and editing happen in a dialog, which saves and then checks.

type Repo = RepoList['repos'][number];
type Props = { projectId: number; onChange: () => void };

const listOf = (items: string[]) =>
  items.join(getCurrentLocale().startsWith('zh') ? '、' : ', ');
const messageOf = (e: unknown) =>
  e instanceof NocoReachHttpError
    ? e.message
    : $t('common.operationFailedRetry');

/** What the latest check says: its tag and, in words, what it found. */
function repoHealth(r: Repo): { tone: Tone; label: string; text: string } {
  const c = r.check;
  if (!c)
    return {
      tone: 'grey',
      label: $t('repos.notChecked'),
      text: $t('repos.neverChecked'),
    };
  const at = ` · ${formatDateTime(c.at)}`;
  if (c.branch === 'missing')
    return {
      tone: 'red',
      label: $t('repos.problem'),
      text: $t('repos.checkBranchMissing', { 0: r.baseBranch }) + at,
    };
  // GitHub not seeing it: a typo, or a private repository the server cannot see but the runner can.
  if (c.repo === 'missing')
    return {
      tone: 'amber',
      label: $t('repos.attention'),
      text: $t('repos.checkRepoMissing', { 0: r.repo }) + at,
    };
  if (c.repo === 'unknown' || c.branch === 'unknown')
    return {
      tone: 'grey',
      label: $t('repos.unconfirmed'),
      text:
        $t('repos.checkUnknown', { 0: c.detail || '' }).replace(/[。.]$/u, '') +
        at,
    };
  if (c.runner === 'offline')
    return {
      tone: 'grey',
      label: $t('repos.unconfirmed'),
      text: $t('repos.checkRunnerOffline') + at,
    };
  return {
    tone: 'green',
    label: $t('repos.writable'),
    text: $t(r.lastPr ? 'repos.checkOkPushed' : 'repos.checkOk') + at,
  };
}

export function RepoConnect(props: Props) {
  return <RepoPanel key={props.projectId} {...props} />;
}

function RepoPanel({ projectId, onChange }: Props) {
  const { can: canSave } = useBusinessAccess('nrAgent.saveRepo', projectId);
  const { can: canRemove } = useBusinessAccess('nrAgent.removeRepo', projectId);
  const { can: canCheck } = useBusinessAccess('nrAgent.checkRepo', projectId);
  const [list, setList] = useState<RepoList>();
  const [loadError, setLoadError] = useMessageState('');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState<{ repo?: Repo } | null>(null);
  const load = useCallback(async () => {
    try {
      setList(await agentRequest<RepoList>('repos', projectId));
      setLoadError('');
    } catch (e) {
      setLoadError(() =>
        e instanceof NocoReachHttpError
          ? e.message
          : $t('repo.notLoadRepositorySettings'),
      );
    }
  }, [projectId, setLoadError]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function run(owner: string, fn: () => Promise<RepoList>) {
    setBusy(owner);
    try {
      setList(await fn());
      onChange();
    } catch (e) {
      toast.error(() => messageOf(e));
      if (e instanceof NocoReachHttpError && e.status === 409) void load();
    } finally {
      setBusy('');
    }
  }
  const check = (r: Repo) =>
    run(`check-${r.id}`, () =>
      agentRequest<RepoList>('checkRepo', projectId, { id: r.id }),
    );
  async function remove(r: Repo) {
    if (!list) return;
    if (
      !(await confirmAction({
        title: () => $t('repo.removeRepository', { 0: r.repo }),
        description: () => $t('repo.newTasksCannotChangeRepository'),
        action: () => $t('common.remove'),
      }))
    )
      return;
    await run(`remove-${r.id}`, () =>
      agentRequest<RepoList>('removeRepo', projectId, {
        revision: list.revision,
        id: r.id,
      }),
    );
  }
  if (!list)
    return loadError ? (
      <p role='alert' className='text-sm text-destructive'>
        {loadError}{' '}
        <Button variant='outline' size='sm' onClick={() => void load()}>
          {$t('common.retry')}
        </Button>
      </p>
    ) : (
      <div
        role='status'
        aria-label={$t('common.loadingLoading')}
        className='flex flex-col gap-4'
      >
        <Skeleton className='h-40 w-full' />
        <Skeleton className='h-40 w-full' />
      </div>
    );
  const only = list.repos.length === 1;
  return (
    <div className='flex flex-col gap-4'>
      {list.repos.map((r) => {
        const health = repoHealth(r);
        return (
          <StatusCard
            key={r.id}
            data-repo={r.repo}
            title={
              <a
                className='hover:underline'
                href={`https://github.com/${r.repo}`}
                target='_blank'
                rel='noreferrer'
              >
                {r.repo}
              </a>
            }
            tag={
              <Tag tone={health.tone} dot>
                {health.label}
              </Tag>
            }
            actions={
              <>
                {canCheck && (
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={Boolean(busy)}
                    onClick={() => void check(r)}
                  >
                    {busy === `check-${r.id}` && (
                      <Spinner data-icon='inline-start' />
                    )}
                    {$t('repos.recheck')}
                  </Button>
                )}
                {canSave && (
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={Boolean(busy)}
                    onClick={() => setEditing({ repo: r })}
                  >
                    {$t('common.edit')}
                  </Button>
                )}
                {canRemove && (
                  <Button
                    variant='ghost'
                    size='sm'
                    disabled={Boolean(busy)}
                    onClick={() => void remove(r)}
                  >
                    {busy === `remove-${r.id}` && (
                      <Spinner data-icon='inline-start' />
                    )}
                    {$t('common.remove')}
                  </Button>
                )}
              </>
            }
          >
            <StatusRow label={$t('repos.urls')}>
              {r.urls.length ? (
                <span className='flex flex-wrap gap-1.5'>
                  {r.urls.map((u) => (
                    <span key={u} className={chipClass}>
                      {u}
                    </span>
                  ))}
                </span>
              ) : (
                <span className='text-muted-foreground'>
                  {$t(only ? 'repos.allUrls' : 'repos.noUrls')}
                </span>
              )}
            </StatusRow>
            <StatusRow label={$t('repos.branch')}>
              {`${r.baseBranch} · ${
                r.allowedPaths.length
                  ? $t('repos.onlyPaths', { 0: listOf(r.allowedPaths) })
                  : $t('repos.wholeRepository')
              }`}
            </StatusRow>
            <StatusRow label={$t('repos.check')}>
              <span data-repo-check=''>{health.text}</span>
            </StatusRow>
            <StatusRow label={$t('repos.lastPr')}>
              {r.lastPr ? (
                <span>
                  <a
                    className='nr-link'
                    href={r.lastPr.url}
                    target='_blank'
                    rel='noreferrer'
                  >
                    #{r.lastPr.number} {r.lastPr.title}
                  </a>{' '}
                  <span className='text-muted-foreground'>
                    {formatDate(r.lastPr.at)}
                  </span>
                </span>
              ) : (
                <span className='text-muted-foreground'>
                  {$t('repos.noPr')}
                </span>
              )}
            </StatusRow>
          </StatusCard>
        );
      })}
      {canSave && (
        <button
          type='button'
          className='flex h-12 w-full cursor-pointer items-center gap-2 rounded-xl border border-dashed border-foreground/25 px-4 text-sm font-medium text-primary transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50'
          disabled={Boolean(busy)}
          onClick={() => setEditing({})}
        >
          <Plus className='size-4' aria-hidden='true' />
          {$t(list.repos.length ? 'repos.addAnother' : 'repos.addFirst')}
        </button>
      )}
      <p className='text-sm text-muted-foreground'>{$t('repos.note')}</p>
      <RepoDialog
        projectId={projectId}
        list={list}
        editing={editing}
        canCheck={canCheck}
        onClose={() => setEditing(null)}
        onSaved={(next) => {
          setList(next);
          setEditing(null);
          onChange();
        }}
      />
    </div>
  );
}

function RepoDialog({
  editing,
  onClose,
  ...form
}: {
  projectId: number;
  list: RepoList;
  editing: { repo?: Repo } | null;
  canCheck: boolean;
  onClose: () => void;
  onSaved: (list: RepoList) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={Boolean(editing)}
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
    >
      {/* Made anew each time it opens, from the repository being edited or empty. */}
      {editing && (
        <RepoForm
          {...form}
          repo={editing.repo}
          busy={busy}
          setBusy={setBusy}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function RepoForm({
  projectId,
  list,
  repo,
  canCheck,
  busy,
  setBusy,
  onClose,
  onSaved,
}: {
  projectId: number;
  list: RepoList;
  repo?: Repo;
  canCheck: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onClose: () => void;
  onSaved: (list: RepoList) => void;
}) {
  const id = useId();
  const [link, setLink] = useState(repo?.repo || ''),
    [branch, setBranch] = useState(repo?.baseBranch || 'main'),
    [urls, setUrls] = useState<string[]>(
      repo?.urls ?? (list.repos.length ? [] : list.sites),
    ),
    // Addresses typed here stay offered after they are unticked.
    [extra, setExtra] = useState<string[]>(
      (repo?.urls || []).filter((u) => !list.sites.includes(u)),
    ),
    [adding, setAdding] = useState(false),
    [other, setOther] = useState(''),
    [otherError, setOtherError] = useMessageState(''),
    [limit, setLimit] = useState(Boolean(repo?.allowedPaths.length)),
    [paths, setPaths] = useState(repo?.allowedPaths.join(', ') || ''),
    [error, setError] = useMessageState('');
  // The website's addresses, then those other repositories serve (picking one moves it here), then those typed in.
  const offered = [
    ...new Set([
      ...list.sites,
      ...list.repos.filter((r) => r.id !== repo?.id).flatMap((r) => r.urls),
      ...extra,
    ]),
  ];
  const toggle = (u: string) =>
    setUrls((now) =>
      now.includes(u) ? now.filter((x) => x !== u) : [...now, u],
    );
  const addOther = () => {
    const key = repoUrlKey(other);
    if (!key) return setOtherError(() => $t('repos.urlInvalid'));
    setExtra((now) => (now.includes(key) ? now : [...now, key]));
    setUrls((now) => (now.includes(key) ? now : [...now, key]));
    setOther('');
    setOtherError('');
    setAdding(false);
  };
  // An address belongs to one repository: saving it here moves it from the one that has it.
  const moves = urls
    .map((u) => [u, urlOwner(list.repos, u, repo?.id)?.repo] as const)
    .filter((m): m is readonly [string, string] => Boolean(m[1]));
  const example = list.sites[0]?.split('/')[0] || 'example.com';
  async function save() {
    setBusy(true);
    setError('');
    try {
      let next = await agentRequest<RepoList>('saveRepo', projectId, {
        revision: list.revision,
        ...(repo ? { id: repo.id } : {}),
        repo: link,
        baseBranch: branch,
        urls,
        allowedPaths: limit
          ? paths
              .split(/[,\n，、]/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      });
      const saved =
        repo?.id ??
        next.repos.find((r) => !list.repos.some((o) => o.id === r.id))?.id;
      if (saved && canCheck)
        next = await agentRequest<RepoList>('checkRepo', projectId, {
          id: saved,
        }).catch(() => next);
      onSaved(next);
    } catch (e) {
      setError(() => messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <DialogContent className='flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-lg'>
      <DialogHeader>
        <DialogTitle>
          {repo
            ? $t('repos.editTitle', { 0: repo.repo })
            : $t(list.repos.length ? 'repos.addAnother' : 'repos.addFirst')}
        </DialogTitle>
      </DialogHeader>
      <form
        id={`${id}-form`}
        className='-mx-4 flex min-h-0 flex-col gap-5 overflow-y-auto px-4 pb-1'
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field>
          <FieldLabel htmlFor={`${id}-repo`}>
            {$t('common.repositoryLink')}
          </FieldLabel>
          <Input
            id={`${id}-repo`}
            required
            value={link}
            disabled={busy}
            placeholder='https://github.com/org/website'
            onChange={(e) => setLink(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel id={`${id}-urls`}>{$t('repos.serves')}</FieldLabel>
          <div
            role='group'
            aria-labelledby={`${id}-urls`}
            className='flex flex-wrap gap-2'
          >
            {offered.map((u) => {
              const on = urls.includes(u);
              return (
                <button
                  key={u}
                  type='button'
                  aria-pressed={on}
                  disabled={busy}
                  className={cn(
                    chipClass,
                    chipButtonClass,
                    'h-8 px-3 text-sm',
                    on &&
                      'border-primary/60 bg-nr-tint-blue text-nr-ink-blue hover:bg-nr-tint-blue',
                  )}
                  onClick={() => toggle(u)}
                >
                  {u}
                </button>
              );
            })}
            {!adding && (
              <button
                type='button'
                disabled={busy}
                className={cn(chipClass, chipButtonClass, 'h-8 px-3 text-sm')}
                onClick={() => setAdding(true)}
              >
                <Plus className='size-3.5' aria-hidden='true' />
                {$t('repos.otherUrl')}
              </button>
            )}
          </div>
          {adding && (
            <div className='flex gap-2'>
              <Input
                autoFocus
                aria-label={$t('repos.otherUrl')}
                aria-invalid={Boolean(otherError)}
                value={other}
                disabled={busy}
                placeholder={$t('repos.otherUrlPlaceholder', { 0: example })}
                onChange={(e) => {
                  setOther(e.target.value);
                  setOtherError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addOther();
                  }
                }}
              />
              <Button
                type='button'
                variant='outline'
                disabled={busy || !other.trim()}
                onClick={addOther}
              >
                {$t('common.add')}
              </Button>
            </div>
          )}
          {otherError && (
            <p role='alert' className='text-sm text-destructive'>
              {otherError}
            </p>
          )}
          <FieldDescription>
            {$t(
              list.sites.length ? 'repos.servesHelp' : 'repos.servesHelpNoSite',
              {
                0: example,
              },
            )}
          </FieldDescription>
          {moves.map(([u, from]) => (
            <p
              key={u}
              className='text-sm text-muted-foreground'
              data-repo-move=''
            >
              {$t('repos.moves', { 0: u, 1: from })}
            </p>
          ))}
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-branch`}>
            {$t('repo.baseBranch')}
          </FieldLabel>
          <Input
            id={`${id}-branch`}
            required
            value={branch}
            disabled={busy}
            onChange={(e) => setBranch(e.target.value)}
          />
        </Field>
        {limit ? (
          <Field>
            <FieldLabel htmlFor={`${id}-paths`}>
              {$t('repo.allowedPathsCommaSeparatedLeave')}
            </FieldLabel>
            <Input
              id={`${id}-paths`}
              value={paths}
              disabled={busy}
              placeholder='docs, website'
              onChange={(e) => setPaths(e.target.value)}
            />
          </Field>
        ) : (
          <Button
            type='button'
            variant='link'
            size='sm'
            className='h-auto self-start p-0 font-normal'
            disabled={busy}
            onClick={() => setLimit(true)}
          >
            {$t('repos.limitPaths')}
          </Button>
        )}
        {error && (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        )}
      </form>
      <DialogFooter>
        <Button variant='outline' disabled={busy} onClick={onClose}>
          {$t('common.cancel')}
        </Button>
        <Button
          type='submit'
          form={`${id}-form`}
          disabled={busy || !link.trim() || !branch.trim()}
        >
          {busy && <Spinner data-icon='inline-start' />}
          {$t(canCheck ? 'repos.saveAndCheck' : 'common.save')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { $t, useNocoReachLocale } from '#i18n';
import { RouteDrawer } from '#components/route-drawer';
import { Button } from '#components/ui/button';
import { LongText } from '#components/long-text';
import { Section } from '#components/reach/page';
import { ListSkeleton, LoadError, InlineError } from '#components/reach/states';
import { useBusinessAccess } from '#hooks/use-business-access';
import { formatCount, formatDateTime } from '#lib/format';
import { toast } from '#lib/toast';
import { useProject } from '../reach-data.js';
import {
  discoveryRequest,
  discoveryDetection,
  retryable,
  type DiscoveredRepository,
  type DiscoveryStatus,
} from './api.js';
import { DetectionBadge } from './components.js';
export default function DiscoveryDetail() {
  useNocoReachLocale();
  const { project } = useProject(),
    { repositoryId } = useParams();
  return project && repositoryId ? (
    <Detail
      key={`${project.id}:${repositoryId}`}
      projectId={project.id}
      repositoryId={repositoryId}
    />
  ) : null;
}
function Detail({
  projectId,
  repositoryId,
}: {
  projectId: number;
  repositoryId: string;
}) {
  const location = useLocation();
  const [repo, setRepo] = useState<DiscoveredRepository>(),
    [status, setStatus] = useState<DiscoveryStatus>(),
    [error, setError] = useState<unknown>(),
    [failure, setFailure] = useState(''),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false);
  const aliveRef = useRef(true);
  const { can } = useBusinessAccess('nrGitHubDiscovery.review', projectId);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      discoveryRequest<DiscoveredRepository>(
        projectId,
        'get',
        { repositoryId },
        { signal: controller.signal },
      ),
      discoveryRequest<DiscoveryStatus>(
        projectId,
        'status',
        {},
        { signal: controller.signal },
      ),
    ])
      .then(([data, next]) => {
        if (!controller.signal.aborted) {
          setRepo(data);
          setStatus(next);
          setError(undefined);
        }
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) {
          setError(e);
          if (!retryable(e)) setRepo(undefined);
        }
      });
    return () => controller.abort();
  }, [projectId, repositoryId, version]);
  async function review(
    value: DiscoveredRepository['review'],
    favorite: boolean,
  ) {
    if (!repo || busy) return;
    setBusy(true);
    setFailure('');
    try {
      const next = await discoveryRequest<DiscoveredRepository>(
        projectId,
        'review',
        { repositoryId, revision: repo.revision, review: value, favorite },
      );
      if (aliveRef.current) {
        setRepo(next);
        toast.success(() => $t('common.saved'));
      }
    } catch (e) {
      if (aliveRef.current)
        setFailure(
          e instanceof Error ? e.message : $t('common.operationFailedRetry'),
        );
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  }
  return (
    <RouteDrawer
      title={repo?.name || $t('githubDiscovery.repository')}
      closeTo={`/data/github?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.search)), view: 'discovery' })}`}
      beforeClose={() => !busy}
      footer={
        repo &&
        can && (
          <div
            className='flex flex-wrap items-center justify-end gap-2'
            aria-busy={busy}
          >
            {busy && (
              <span role='status' className='text-sm text-muted-foreground'>
                {$t('common.saving')}
              </span>
            )}
            {(['confirmed', 'ignored', 'unreviewed'] as const)
              .filter((s) => s !== repo.review)
              .map((s) => (
                <Button
                  key={s}
                  variant='outline'
                  disabled={busy}
                  onClick={() => void review(s, repo.favorite)}
                >
                  {$t(`githubDiscovery.action${s}`)}
                </Button>
              ))}
            <Button
              variant='outline'
              disabled={busy}
              onClick={() => void review(repo.review, !repo.favorite)}
            >
              {$t(
                repo.favorite
                  ? 'githubDiscovery.unfavorite'
                  : 'githubDiscovery.favorite',
              )}
            </Button>
          </div>
        )
      }
    >
      {Boolean(error) && (
        <LoadError
          title={$t('githubDiscovery.loadFailed')}
          message={error instanceof Error ? error.message : undefined}
          onRetry={
            retryable(error) ? () => setVersion((v) => v + 1) : undefined
          }
        />
      )}
      {failure && (
        <InlineError
          action={
            <Button
              variant='outline'
              size='sm'
              onClick={() => setVersion((v) => v + 1)}
            >
              {$t('githubDiscovery.reload')}
            </Button>
          }
        >
          {failure}
        </InlineError>
      )}
      {!repo && !error ? (
        <ListSkeleton />
      ) : repo ? (
        <div className='flex flex-col gap-4'>
          <a
            className='break-all underline-offset-4 hover:underline'
            href={repo.url}
            target='_blank'
            rel='noreferrer'
          >
            {repo.url}
          </a>
          <LongText>{repo.description || '—'}</LongText>
          <dl className='grid grid-cols-[8rem_1fr] gap-3 text-sm'>
            <dt>{$t('githubDiscovery.detection')}</dt>
            <dd>
              <DetectionBadge status={discoveryDetection(repo)} />
            </dd>
            <dt>{$t('githubDiscovery.review')}</dt>
            <dd>
              <DetectionBadge status={repo.review} />
            </dd>
            <dt>{$t('githubDiscovery.license')}</dt>
            <dd>{repo.license || $t('githubDiscovery.unknownLicense')}</dd>
            <dt>{$t('githubDiscovery.stars')}</dt>
            <dd>{formatCount(repo.stars)}</dd>
            {(['createdAt', 'firstDiscoveredAt', 'checkedAt'] as const).map(
              (key) => (
                <Metadata
                  key={key}
                  label={$t(`githubDiscovery.${key}`)}
                  value={formatDateTime(repo[key])}
                />
              ),
            )}
          </dl>
          <p className='text-sm text-muted-foreground'>
            {$t('githubDiscovery.licenseHelp')}
          </p>
          {repo.matches.map((match) => (
            <Section
              key={match.ruleId}
              title={
                status?.rules.find((r) => r.id === match.ruleId)?.name ||
                match.ruleId
              }
            >
              <DetectionBadge status={match.status} />
              <p className='break-all text-xs text-muted-foreground'>
                {match.commit}
              </p>
              {match.evidence.map((e) => (
                <div
                  key={`${e.path}:${e.field || ''}:${e.expected}`}
                  className='flex flex-col gap-1 border-t pt-3 text-sm'
                >
                  <a
                    href={e.url}
                    target='_blank'
                    rel='noreferrer'
                    className='break-all font-medium underline-offset-4 hover:underline'
                  >
                    {e.path}
                    {e.field ? ` · ${e.field}` : ''}
                  </a>
                  <p className='break-words'>
                    {$t('githubDiscovery.expected', { 0: e.expected })}
                  </p>
                  <p className='break-words'>
                    {$t('githubDiscovery.actual', { 0: e.actual ?? '—' })}
                  </p>
                  <span>
                    {$t(
                      e.matched
                        ? 'githubDiscovery.matched'
                        : 'githubDiscovery.unmatched',
                    )}
                  </span>
                </div>
              ))}
            </Section>
          ))}
        </div>
      ) : null}
    </RouteDrawer>
  );
}
function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router';
import { createUuid } from '@nocobase/app-client';
import { Check } from 'lucide-react';
import { $t, useNocoReachLocale } from '#i18n';
import { RouteDialog } from '#components/route-dialog';
import { useRouteOverlay } from '#components/use-route-overlay';
import { SourceLogo } from '#components/reach/source-logo';
import { ListSkeleton, LoadError } from '#components/reach/states';
import { Tag } from '#components/reach/tag';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Textarea } from '#components/ui/textarea';
import { useBusinessAccess } from '#hooks/use-business-access';
import { formatDate, withDetail } from '#lib/format';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { toast } from '#lib/toast';
import { cn } from '#lib/utils';
import {
  ANGLE_MAX,
  destinationKey,
  destinationName,
  LINKS_MAX,
  REPURPOSE_FORMS,
  POINTS_MAX,
  subredditName,
  TOPIC_MAX,
  type Destination,
  type RepurposeForm,
  type RepurposeSource,
} from '../../../shared/repurpose.js';
import { useProject } from '../reach-data.js';
import { AgentMenu } from '../task-detail/agent-menu.js';
import { taskAgentOf, type AgentStatus } from '../task-agents.js';
import type { TaskData } from '../task-execution-types.js';
import type { WorkshopOutlet } from './index.js';
import { CategoryTag } from '../strategy/growth';
import {
  errorText,
  getFormNames,
  hotHeadlineText,
  opportunityNo,
  standingText,
  taskNo,
  workshopRequest,
  type Article,
  type HotItem,
  type Made,
  type WorkshopView,
} from './model.js';

type Item = { form: RepurposeForm; destination?: Destination };
const itemKey = (i: Item) => `${i.form}|${destinationKey(i.destination)}`;

/**
 * What to make (mockup v3 frame 3, homepage v5): the forms, a task each, a community post once per destination. Nothing
 * is ticked for you, except (v4) the subreddit holding most of a trending item's discussions. Library's Adapt and a
 * published article task's Adapt this article open it for an article (`?url=&title=`), Adapt now and Opportunities'
 * Adapt into short posts for a Trending now item (`?opportunity=`). Adapt a new topic opens it without either: step 1
 * is the topic's form. Under the workshop page it reads the page's data; under a task or an opportunity it loads its
 * own, and under an opportunity it tells the page when tasks were made.
 */
export default function WorkshopPick() {
  useNocoReachLocale();
  const { project } = useProject();
  const outlet = useOutletContext<Partial<WorkshopOutlet> | undefined>();
  const fromPage = outlet && 'reload' in outlet ? outlet : null;
  const onCreated =
    outlet && 'onCreated' in outlet
      ? (outlet as { onCreated?: () => void }).onCreated
      : undefined;
  const projectId = project ? String(project.id) : '';
  const [own, setOwn] = useState<{
    projectId: string;
    view?: WorkshopView;
    error?: string;
  }>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!projectId || fromPage) return;
    let alive = true;
    void workshopRequest<WorkshopView>('view', projectId).then(
      (view) => alive && setOwn({ projectId, view }),
      (e: unknown) =>
        alive &&
        setOwn({
          projectId,
          error: errorText(e, $t('workshop.loadFailed')),
        }),
    );
    return () => {
      alive = false;
    };
  }, [projectId, fromPage, retry]);
  const view = fromPage
    ? fromPage.view
    : own?.projectId === projectId
      ? own.view
      : undefined;
  const error = fromPage ? undefined : own?.error;
  return (
    <Pick
      projectId={projectId}
      view={view}
      error={error}
      onRetry={() => setRetry((n) => n + 1)}
      onCreated={onCreated}
    />
  );
}

function Pick({
  projectId,
  view,
  error,
  onRetry,
  onCreated,
}: {
  projectId: string;
  view?: WorkshopView;
  error?: string;
  onRetry: () => void;
  onCreated?: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const hotId = params.get('opportunity');
  const url = params.get('url'),
    title = params.get('title');
  const chosen = url && title ? { url, title } : null;
  // An article or a trending item comes with the address; otherwise it is a new topic, written in step 1.
  const given = Boolean(chosen || hotId);
  const hot = hotId ? view?.hot.find((h) => h.id === hotId) : undefined;
  const [step, setStep] = useState<1 | 2>(1);
  const [topic, setTopic] = useState({ topic: '', points: '', links: '' });
  const source: RepurposeSource | null = hot
    ? {
        kind: 'opportunity',
        id: hot.id,
        ...(hot.no ? { no: hot.no } : {}),
        headline: hotHeadlineText(hot),
      }
    : chosen && !hotId
      ? { kind: 'article', ...chosen }
      : !given && topic.topic.trim()
        ? {
            kind: 'topic',
            topic: topic.topic.trim(),
            ...(topic.points.trim() ? { points: topic.points.trim() } : {}),
            ...(links(topic.links).length ? { links: links(topic.links) } : {}),
          }
        : null;
  const article =
    source?.kind === 'article'
      ? view?.articles.find((a) => a.url === source.url)
      : undefined;
  const topicProblem =
    topic.topic.trim().length > TOPIC_MAX
      ? $t('workshop.topicTooLong', { 0: TOPIC_MAX })
      : topic.points.trim().length > POINTS_MAX
        ? $t('workshop.pointsTooLong', { 0: POINTS_MAX })
        : links(topic.links).length > LINKS_MAX
          ? $t('workshop.linksMax', { 0: LINKS_MAX })
          : '';
  // Back to the workshop, or to the opportunity it was opened from (its tab and selection kept); under a task, back to it.
  const kept = new URLSearchParams(params);
  for (const k of ['opportunity', 'url', 'title']) kept.delete(k);
  const closeTo = location.pathname.startsWith('/workshop')
    ? '/workshop'
    : location.pathname.startsWith('/opportunities')
      ? `/opportunities${kept.size ? `?${kept}` : ''}`
      : undefined;
  const created = () => {
    if (closeTo?.startsWith('/opportunities')) {
      onCreated?.();
      void navigate(closeTo, { replace: true });
    } else void navigate('/workshop', { replace: true });
  };
  if (source && view && (given || step === 2))
    return (
      <Step2
        projectId={projectId}
        view={view}
        source={source}
        article={article}
        hot={hot}
        // A new topic goes back to step 1 to be edited; an article or a trending item is changed by closing the dialog
        // and picking another.
        onEdit={given ? undefined : () => setStep(1)}
        closeTo={closeTo}
        onCreated={created}
      />
    );
  if (given)
    return (
      <RouteDialog
        title={$t('workshop.repurposeOpportunity')}
        closeTo={closeTo}
        className={DIALOG}
        footer={<Cancel />}
      >
        {error && !view ? (
          <LoadError
            title={$t('workshop.loadFailed')}
            message={error}
            onRetry={onRetry}
          />
        ) : !view ? (
          <ListSkeleton rows={5} />
        ) : (
          // The trending item is no longer live (ignored, replaced or expired since the page loaded).
          <p className='py-6 text-center text-sm text-muted-foreground'>
            {$t('workshop.hotGone')}
          </p>
        )}
      </RouteDialog>
    );
  return (
    <RouteDialog
      title={$t('workshop.newTopic')}
      description={<Steps step={1} />}
      closeTo={closeTo}
      className={DIALOG}
      footer={
        <>
          <Cancel />
          <Button
            disabled={!view || !source || Boolean(topicProblem)}
            onClick={() => setStep(2)}
          >
            {$t('workshop.next')}
          </Button>
        </>
      }
    >
      {error && !view ? (
        <LoadError
          title={$t('workshop.loadFailed')}
          message={error}
          onRetry={onRetry}
        />
      ) : (
        <TopicStep topic={topic} onTopic={setTopic} problem={topicProblem} />
      )}
    </RouteDialog>
  );
}

// Both steps share one size, so the dialog stays put as they change; longer content scrolls.
const DIALOG = 'h-[min(48rem,calc(100dvh-2rem))] sm:max-w-4xl';

const links = (text: string) => [
  ...new Set(
    text
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];

function Steps({ step }: { step: 1 | 2 }) {
  return (
    <span className='flex items-center gap-2 text-xs'>
      <span
        className={cn(
          step === 1 ? 'font-semibold text-primary' : 'text-nr-ink-green',
          'inline-flex items-center gap-1',
        )}
      >
        {step === 1 ? <span>1</span> : <Check className='size-3.5' />}
        {$t('workshop.stepTopic')}
      </span>
      <span aria-hidden='true'>›</span>
      <span
        className={cn(
          step === 2 && 'font-semibold text-primary',
          'inline-flex items-center gap-1',
        )}
        aria-current={step === 2 ? 'step' : undefined}
      >
        <span>2</span>
        {$t('workshop.stepForm')}
      </span>
    </span>
  );
}

/** Adapt a new topic's step 1: the topic, with optional key points and reference links. */
export function TopicStep({
  topic,
  onTopic,
  problem,
}: {
  topic: { topic: string; points: string; links: string };
  onTopic: (t: { topic: string; points: string; links: string }) => void;
  problem: string;
}) {
  return (
    <div className='space-y-3' data-topic-step=''>
      <div className='space-y-1.5'>
        <Label htmlFor='workshop-topic'>{$t('workshop.topic')}</Label>
        <Input
          id='workshop-topic'
          value={topic.topic}
          maxLength={TOPIC_MAX + 20}
          onChange={(e) => onTopic({ ...topic, topic: e.target.value })}
        />
      </div>
      <div className='space-y-1.5'>
        <Label htmlFor='workshop-points'>
          {$t('workshop.points')}
          <span className='font-normal text-muted-foreground'>
            · {$t('workshop.optional')}
          </span>
        </Label>
        <Textarea
          id='workshop-points'
          rows={4}
          value={topic.points}
          onChange={(e) => onTopic({ ...topic, points: e.target.value })}
        />
      </div>
      <div className='space-y-1.5'>
        <Label htmlFor='workshop-links'>
          {$t('workshop.links')}
          <span className='font-normal text-muted-foreground'>
            · {$t('workshop.optional')}
          </span>
        </Label>
        <Textarea
          id='workshop-links'
          rows={2}
          placeholder={$t('workshop.linksHint')}
          value={topic.links}
          onChange={(e) => onTopic({ ...topic, links: e.target.value })}
        />
      </div>
      {problem ? <p className='text-sm text-destructive'>{problem}</p> : null}
      <p className='text-sm text-muted-foreground'>
        {$t('workshop.topicHint')}
      </p>
    </div>
  );
}

// A trending item's subreddits and Hacker News, as places to post: the subreddit with most of its discussions is
// ticked (v4, approved: a fact about where it is discussed, not a suggestion), unless it was already made for it.
function hotPicks(hot: HotItem | undefined): Map<string, Item> {
  const top = hot?.communities.subreddits[0];
  if (!top) return new Map<string, Item>();
  const item: Item = {
    form: 'community',
    destination: { kind: 'reddit', subreddit: top.subreddit },
  };
  const made = hot.made.some(
    (m) =>
      m.form === 'community' &&
      destinationKey(m.destination) === destinationKey(item.destination),
  );
  return new Map<string, Item>(made ? [] : [[itemKey(item), item]]);
}

function Step2({
  projectId,
  view,
  source,
  article,
  hot,
  onEdit,
  closeTo,
  onCreated,
}: {
  projectId: string;
  view: WorkshopView;
  source: RepurposeSource;
  article?: Article;
  hot?: HotItem;
  /** A new topic's way back to step 1. */
  onEdit?: () => void;
  closeTo?: string;
  onCreated: () => void;
}) {
  const { can } = useBusinessAccess('nrWorkshop.create', projectId);
  const [picked, setPicked] = useState<Map<string, Item>>(() => hotPicks(hot));
  const [angle, setAngle] = useState('');
  const [extra, setExtra] = useState<string[]>([]);
  const [other, setOther] = useState('');
  const [agents, setAgents] = useState<AgentStatus>();
  const [agentId, setAgentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  useEffect(() => {
    let alive = true;
    void api
      .action<AgentStatus>('nrAgent', 'status', {
        method: 'POST',
        body: { projectId },
        unwrap: 'data',
      })
      .then(
        (a) => {
          if (!alive) return;
          setAgents(a);
          setAgentId((id) => id ?? taskAgentOf(undefined, a)?.id ?? null);
        },
        () => undefined,
      );
    return () => {
      alive = false;
    };
  }, [projectId]);
  // One request id per choice: a retry after a lost response finds the tasks it already made, a changed choice is new.
  const choice = JSON.stringify([
    source,
    [...picked.keys()].sort(),
    agentId,
    angle.trim(),
  ]);
  const [request, setRequest] = useState<{ choice: string; id: string }>();
  const made = hot ? hot.made : article?.made || [];
  // An article or a trending item adapted before: the drafts the Agent reads to take another angle, approved or waiting
  // for review (the server's `earlier`, the latest five).
  const earlier = [...made]
    .filter((m) => m.drafted)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 5);
  const withAngle = Boolean(hot) || earlier.length > 0;
  const angleProblem =
    angle.trim().length > ANGLE_MAX
      ? $t('workshop.angleTooLong', { 0: ANGLE_MAX })
      : '';
  const toggle = (item: Item, on: boolean) =>
    setPicked((m) => {
      const next = new Map(m);
      if (on) next.set(itemKey(item), item);
      else next.delete(itemKey(item));
      return next;
    });
  const isOn = (item: Item) => picked.has(itemKey(item));
  const reddit = view.destinations.reddit;
  const subs = [
    ...(hot?.communities.subreddits || []).map((s) => ({
      subreddit: s.subreddit,
      note: $t('workshop.hot.here', { 0: s.discussions }),
      discussions: 0,
    })),
    ...reddit.subreddits.map((s) => ({
      subreddit: s.subreddit,
      note: $t('workshop.redditDiscussions', {
        0: s.discussions,
        1: reddit.weeks,
      }),
      discussions: s.discussions,
    })),
    ...(reddit.subreddits.length
      ? []
      : reddit.recent.map((s) => ({
          subreddit: s,
          note: $t('workshop.redditRecent'),
          discussions: 0,
        }))),
    ...extra.map((s) => ({ subreddit: s, note: '', discussions: 0 })),
  ].filter(
    (s, i, all) =>
      all.findIndex(
        (x) => x.subreddit.toLowerCase() === s.subreddit.toLowerCase(),
      ) === i,
  );
  const otherName = subredditName(other);
  const addOther = () => {
    if (!otherName) return;
    setExtra((list) => [...list, otherName]);
    toggle(
      {
        form: 'community',
        destination: { kind: 'reddit', subreddit: otherName },
      },
      true,
    );
    setOther('');
  };
  const count = picked.size;
  const agentData = {
    work: { agentId: agentId ?? undefined },
    agent: {
      repo: null,
      online: true,
      agentId,
      options: agents?.options || [],
    },
  } as unknown as TaskData;
  const submit = async () => {
    const requestId = request?.choice === choice ? request.id : createUuid();
    setRequest({ choice, id: requestId });
    setBusy(true);
    setFailure('');
    try {
      const r = await workshopRequest<{ taskIds: string[]; started: string[] }>(
        'create',
        projectId,
        {
          requestId,
          source,
          items: [...picked.values()],
          ...(agentId ? { agentId } : {}),
          ...(withAngle && angle.trim() ? { angle: angle.trim() } : {}),
        },
      );
      toast.success(() => $t('workshop.handedOff', { 0: r.taskIds.length }));
      const stuck = r.taskIds.length - r.started.length;
      if (stuck > 0)
        toast.warning(() => $t('workshop.notStarted', { 0: stuck }));
      onCreated();
    } catch (e) {
      setFailure(errorText(e, $t('workshop.createFailed')));
    } finally {
      setBusy(false);
    }
  };
  const madeFor = (item: Item) => {
    const key = destinationKey(item.destination);
    const mine = made.filter(
      (m) => m.form === item.form && destinationKey(m.destination) === key,
    );
    return (
      mine.find((m) => m.standing === 'done') ||
      mine.find((m) => m.standing !== 'closed')
    );
  };
  const status = (item: Item) => {
    const shown = madeFor(item);
    return shown ? <MadeNote made={shown} /> : null;
  };
  // A trending item is made into each form once (v4): a form already made from it is marked and cannot be ticked.
  // An article's stays open, to be told again from another angle.
  const locked = (item: Item) => Boolean(hot && madeFor(item));
  const names = getFormNames();
  return (
    <RouteDialog
      title={$t(
        source.kind === 'topic'
          ? 'workshop.newTopic'
          : 'workshop.repurposeOpportunity',
      )}
      description={source.kind === 'topic' ? <Steps step={2} /> : undefined}
      closeTo={closeTo}
      className={DIALOG}
      footer={
        <>
          <span className='mr-auto flex flex-wrap items-center gap-3 text-sm'>
            <b className='font-semibold tabular-nums'>
              {$t('workshop.itemsCount', { 0: count })}
            </b>
            <AgentMenu
              data={agentData}
              busy={busy}
              onChange={async (id) => {
                setAgentId(id);
                return true;
              }}
            />
          </span>
          <Cancel />
          <Button
            disabled={
              !count || busy || !can || !agentId || Boolean(angleProblem)
            }
            title={
              !can
                ? $t('workshop.noAccess')
                : !agentId
                  ? $t('workshop.chooseAgent')
                  : undefined
            }
            onClick={() => void submit()}
          >
            {$t('workshop.handOff', { 0: count })}
          </Button>
        </>
      }
    >
      <div className='space-y-4'>
        {hot ? (
          <HotHeader hot={hot} />
        ) : (
          <div
            className='flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm'
            data-source={source.kind}
          >
            <span className='text-muted-foreground'>
              {$t('workshop.adapt')}
            </span>
            <b className='min-w-0 font-semibold'>
              {source.kind === 'article'
                ? source.title
                : source.kind === 'topic'
                  ? $t('workshop.topicSource', { 0: source.topic })
                  : source.headline}
            </b>
            {article?.published ? (
              <span className='text-xs text-muted-foreground'>
                {$t('workshop.publishedOn', {
                  0: formatDate(article.published),
                })}
              </span>
            ) : null}
            {onEdit ? (
              <Button
                variant='link'
                size='sm'
                className='ml-auto h-auto p-0'
                onClick={onEdit}
              >
                {$t('common.edit')}
              </Button>
            ) : null}
          </div>
        )}
        {earlier.length ? (
          <p
            className='rounded-lg border border-primary/40 bg-primary/5 px-4 py-2.5 text-sm'
            data-again=''
          >
            {$t('workshop.again', { 0: againList(earlier) })}
          </p>
        ) : null}
        {withAngle ? (
          <div className='space-y-1.5' data-angle=''>
            <Label htmlFor='workshop-angle' className='gap-1.5'>
              {$t('workshop.angle')}
              <span className='text-xs font-normal text-muted-foreground'>
                {$t(
                  earlier.length
                    ? 'workshop.angleAgainHint'
                    : 'workshop.angleHotHint',
                )}
              </span>
            </Label>
            <Input
              id='workshop-angle'
              value={angle}
              maxLength={ANGLE_MAX + 50}
              placeholder={
                earlier.length
                  ? $t('workshop.angleAgainPlaceholder')
                  : $t('workshop.angleHotPlaceholder')
              }
              onChange={(e) => setAngle(e.target.value)}
              aria-invalid={Boolean(angleProblem)}
            />
            {angleProblem ? (
              <p className='text-xs text-destructive'>{angleProblem}</p>
            ) : null}
          </div>
        ) : null}
        <div className='grid gap-3 sm:grid-cols-3'>
          <FormCard
            form='xhs'
            name={names.xhs}
            spec={$t('workshop.specXhs')}
            disabled
            preview={<CardsPreview />}
          />
          <FormCard
            form='x'
            name={names.x}
            spec={$t('workshop.specX')}
            checked={isOn({ form: 'x' })}
            onCheckedChange={(on) => toggle({ form: 'x' }, on)}
            status={status({ form: 'x' })}
            locked={locked({ form: 'x' })}
            preview={
              <PostsPreview
                lines={[
                  [90, 70, 40],
                  [80, 55],
                  [85, 60],
                ]}
              />
            }
          />
          <FormCard
            form='linkedin'
            name={names.linkedin}
            spec={$t('workshop.specLinkedin')}
            checked={isOn({ form: 'linkedin' })}
            onCheckedChange={(on) => toggle({ form: 'linkedin' }, on)}
            status={status({ form: 'linkedin' })}
            locked={locked({ form: 'linkedin' })}
            preview={<PostsPreview lines={[[95, 88, 92]]} />}
          />
          <div
            className='rounded-xl border bg-card p-4 sm:col-span-3'
            data-form='community'
          >
            <div className='flex items-center gap-2 text-sm font-semibold'>
              <SourceLogo source='community' size='sm' />
              {names.community}
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              {$t('workshop.specCommunity')}
            </p>
            <div className='mt-3 space-y-1.5 text-sm'>
              {view.brand.community ? (
                view.brand.community.sections.map((section) => {
                  const c = view.brand.community!;
                  const item: Item = {
                    form: 'community',
                    destination: {
                      kind: 'own',
                      name: c.name,
                      url: c.url,
                      section,
                    },
                  };
                  return (
                    <Destination
                      key={section}
                      logo='community'
                      name={c.name}
                      note={section}
                      checked={isOn(item)}
                      onCheckedChange={(on) => toggle(item, on)}
                      status={status(item)}
                      locked={locked(item)}
                    />
                  );
                })
              ) : (
                <p
                  className='flex items-center gap-2 py-0.5 text-muted-foreground'
                  data-own-unset=''
                >
                  <SourceLogo source='community' size='xs' />
                  {$t('workshop.ownNotSet')}
                  <Link className='nr-link' to='/workshop/brand'>
                    {$t('workshop.goSet')}
                  </Link>
                </p>
              )}
              {subs.map((s) => {
                const item: Item = {
                  form: 'community',
                  destination: {
                    kind: 'reddit',
                    subreddit: s.subreddit,
                    ...(s.discussions ? { discussions: s.discussions } : {}),
                  },
                };
                return (
                  <Destination
                    key={s.subreddit}
                    logo='reddit'
                    name={destinationName(item.destination!)}
                    note={s.note}
                    checked={isOn(item)}
                    onCheckedChange={(on) => toggle(item, on)}
                    status={status(item)}
                    locked={locked(item)}
                  />
                );
              })}
              <div className='flex items-center gap-2 pl-6'>
                <Input
                  aria-label={$t('workshop.redditOther')}
                  placeholder={$t('workshop.redditOther')}
                  className='h-7 w-72'
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addOther();
                    }
                  }}
                />
                <Button
                  size='sm'
                  variant='outline'
                  className='h-7'
                  disabled={!otherName}
                  onClick={addOther}
                >
                  {$t('workshop.redditAdd')}
                </Button>
                {other.trim() && !otherName ? (
                  <span className='text-xs text-destructive'>
                    {$t('workshop.subredditInvalid')}
                  </span>
                ) : null}
              </div>
              <Destination
                logo='hackernews'
                name='Hacker News'
                note={
                  hot?.communities.hn
                    ? $t('workshop.hot.here', { 0: hot.communities.hn })
                    : $t('workshop.hnNote')
                }
                checked={isOn({
                  form: 'community',
                  destination: { kind: 'hn' },
                })}
                onCheckedChange={(on) =>
                  toggle({ form: 'community', destination: { kind: 'hn' } }, on)
                }
                status={status({
                  form: 'community',
                  destination: { kind: 'hn' },
                })}
                locked={locked({
                  form: 'community',
                  destination: { kind: 'hn' },
                })}
              />
            </div>
          </div>
        </div>
        {hot && count ? (
          <p className='text-xs text-muted-foreground' data-link-note=''>
            {$t('workshop.hot.linkNote', {
              0: count,
              1: opportunityNo(hot.no),
            })}
          </p>
        ) : null}
        {failure ? (
          <p className='text-sm text-destructive' role='alert'>
            {failure}
          </p>
        ) : null}
      </div>
    </RouteDialog>
  );
}

// Trending now's step 2 head (v4): what is hot, then what the Agent is given with it: the opportunity's analysis, its
// discussions and the site's material.
function HotHeader({ hot }: { hot: HotItem }) {
  const first = hot.discussions[0];
  const rows: [string, ReactNode][] = [
    [
      $t('workshop.hot.analysisLabel'),
      $t('workshop.hot.analysis', { 0: opportunityNo(hot.no) }),
    ],
    ...(first
      ? [
          [
            $t('workshop.hot.discussionsLabel'),
            <span key='d' className='inline-flex min-w-0 items-center gap-1.5'>
              <SourceLogo source={first.logo} size='xs' />
              <span className='truncate'>{first.title}</span>
              {hot.discussionCount > 1 ? (
                <span className='shrink-0 text-muted-foreground'>
                  {$t('workshop.hot.moreDiscussions', {
                    0: hot.discussionCount,
                  })}
                </span>
              ) : null}
            </span>,
          ] as [string, ReactNode],
        ]
      : []),
    ...(hot.material.length
      ? [
          [
            $t('workshop.hot.materialLabel'),
            hot.material.map((m) => m.title).join(' · '),
          ] as [string, ReactNode],
        ]
      : []),
  ];
  return (
    <div
      className='rounded-lg border bg-muted/40 px-4 py-2.5 text-sm'
      data-source='opportunity'
    >
      <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
        <span className='text-muted-foreground'>{$t('workshop.adapt')}</span>
        <CategoryTag category='trending' />
        <b className='min-w-0 font-semibold'>{hotHeadlineText(hot)}</b>
      </div>
      <dl className='mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs'>
        {rows.map(([k, v]) => (
          <Fragment key={k}>
            <dt className='text-muted-foreground'>{k}</dt>
            <dd className='min-w-0 truncate'>{v}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

/**
 * The drafts adapted before, by form in the forms' order: "X posts (T-47), LinkedIn post (T-50), Community post ×2".
 */
function againList(earlier: Made[]) {
  const names = getFormNames();
  return REPURPOSE_FORMS.flatMap((form) => {
    const mine = earlier
      .filter((m) => m.form === form)
      .sort((a, b) => (a.no ?? 0) - (b.no ?? 0));
    if (!mine.length) return [];
    return [
      mine.length > 1
        ? $t('workshop.againMany', { 0: names[form], 1: mine.length })
        : withDetail(names[form], taskNo(mine[0].no)),
    ];
  }).join($t('common.listSeparator'));
}

// Where a form or destination already stands for this article: done (open it), or the task still under way.
function MadeNote({ made }: { made: Made }) {
  return (
    <Link
      to={`/actions/${made.taskId}`}
      className='nr-link text-xs'
      data-made={made.standing}
      onClick={(e) => e.stopPropagation()}
    >
      {made.no
        ? $t('workshop.madeView', {
            0: standingText(made.standing),
            1: taskNo(made.no),
          })
        : standingText(made.standing)}
    </Link>
  );
}

function FormCard({
  form,
  name,
  spec,
  preview,
  disabled,
  checked = false,
  onCheckedChange,
  status,
  locked = false,
}: {
  form: RepurposeForm;
  name: string;
  spec: string;
  preview: ReactNode;
  disabled?: boolean;
  checked?: boolean;
  onCheckedChange?: (on: boolean) => void;
  status?: ReactNode;
  /** Already made from this trending item: marked, and not ticked again. */
  locked?: boolean;
}) {
  const id = `workshop-form-${form}`;
  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl border bg-card p-4',
        checked && 'border-primary ring-1 ring-primary',
        disabled && 'opacity-60',
      )}
      data-form={form}
    >
      <label
        htmlFor={id}
        className={cn(
          'flex items-center gap-2 pr-7 text-sm font-semibold',
          !disabled && !locked && 'cursor-pointer',
        )}
      >
        <SourceLogo source={form === 'xhs' ? 'xiaohongshu' : form} size='sm' />
        {name}
        {disabled ? (
          <Tag tone='grey' className='ml-1'>
            {$t('workshop.comingSoon')}
          </Tag>
        ) : null}
      </label>
      <Checkbox
        id={id}
        className='absolute top-4 right-4'
        checked={checked}
        disabled={disabled || locked}
        onCheckedChange={(on) => onCheckedChange?.(Boolean(on))}
        aria-label={name}
      />
      <p className='mt-1 text-xs text-muted-foreground'>{spec}</p>
      <div className='mt-3 flex h-11 items-end gap-1.5' aria-hidden='true'>
        {preview}
      </div>
      {status ? <div className='mt-2'>{status}</div> : null}
    </div>
  );
}

// A form's shape at a glance: the cards of an image note, the posts of a text form.
function CardsPreview() {
  return (
    <>
      <span className='h-11 w-8 rounded bg-primary/80' />
      <span className='h-11 w-8 rounded bg-muted' />
      <span className='h-11 w-8 rounded bg-muted' />
      <span className='h-11 w-8 rounded bg-muted' />
      <span className='self-center text-xs text-muted-foreground'>…</span>
    </>
  );
}

function PostsPreview({ lines }: { lines: number[][] }) {
  return (
    <>
      {lines.map((post, i) => (
        <span
          key={i}
          className='flex h-11 flex-1 flex-col gap-1 rounded-md border bg-muted/40 px-2 py-1.5'
        >
          {post.map((w, j) => (
            <i
              key={j}
              className='block h-1 rounded-full bg-muted-foreground/20'
              style={{ width: `${w}%` }}
            />
          ))}
        </span>
      ))}
    </>
  );
}

function Destination({
  logo,
  name,
  note,
  checked,
  onCheckedChange,
  status,
  locked = false,
}: {
  logo: string;
  name: string;
  note?: string;
  checked: boolean;
  onCheckedChange: (on: boolean) => void;
  status?: ReactNode;
  locked?: boolean;
}) {
  return (
    <div
      className='flex flex-wrap items-center gap-2 py-0.5'
      data-destination=''
    >
      <label
        className={cn('flex items-center gap-2', !locked && 'cursor-pointer')}
      >
        <Checkbox
          checked={checked}
          disabled={locked}
          onCheckedChange={(on) => onCheckedChange(Boolean(on))}
          aria-label={note ? `${name} · ${note}` : name}
        />
        <SourceLogo source={logo} size='xs' />
        <span>{name}</span>
        {note ? (
          <span className='text-xs text-muted-foreground'>· {note}</span>
        ) : null}
      </label>
      {status}
    </div>
  );
}

// Inside the dialog's footer, so it closes through the overlay (to the workshop, or back to the task).
function Cancel() {
  const { close } = useRouteOverlay();
  return (
    <Button variant='ghost' onClick={() => void close()}>
      {$t('common.cancel')}
    </Button>
  );
}

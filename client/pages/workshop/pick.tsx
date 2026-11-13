import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router';
import { createUuid } from '@nocobase/app-client';
import { Check, Search } from 'lucide-react';
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
import { RadioGroup, RadioGroupItem } from '#components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '#components/ui/tabs';
import { Textarea } from '#components/ui/textarea';
import { useBusinessAccess } from '#hooks/use-business-access';
import { formatCount, formatDate } from '#lib/format';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { toast } from '#lib/toast';
import { cn } from '#lib/utils';
import {
  destinationKey,
  destinationName,
  LINKS_MAX,
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
import {
  errorText,
  getFormNames,
  madeList,
  standingText,
  taskNo,
  workshopRequest,
  type Article,
  type Made,
  type WorkshopView,
} from './model.js';

type Item = { form: RepurposeForm; destination?: Destination };
const itemKey = (i: Item) => `${i.form}|${destinationKey(i.destination)}`;

/**
 * Pick content (mockup v3 frames 2 and 3): step 1 chooses what to adapt, any blog article or a new topic; step 2 the
 * forms, a task each, a community post once per destination. Nothing is ticked for you. A recommendation's Adapt and
 * a published article task's Adapt this article open step 2 directly (`?url=&title=`). Under the workshop page it
 * reads the page's data; under a task it loads its own.
 */
export default function WorkshopPick() {
  useNocoReachLocale();
  const { project } = useProject();
  const outlet = useOutletContext<Partial<WorkshopOutlet> | undefined>();
  const fromPage = outlet && 'reload' in outlet ? outlet : null;
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
    />
  );
}

function Pick({
  projectId,
  view,
  error,
  onRetry,
}: {
  projectId: string;
  view?: WorkshopView;
  error?: string;
  onRetry: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const given = params.get('url') && params.get('title');
  const [step, setStep] = useState<1 | 2>(given ? 2 : 1);
  const [tab, setTab] = useState<'article' | 'topic'>('article');
  const [chosen, setChosen] = useState<{ url: string; title: string } | null>(
    given ? { url: params.get('url')!, title: params.get('title')! } : null,
  );
  const [topic, setTopic] = useState({ topic: '', points: '', links: '' });
  const source: RepurposeSource | null =
    tab === 'topic' && !given
      ? topic.topic.trim()
        ? {
            kind: 'topic',
            topic: topic.topic.trim(),
            ...(topic.points.trim() ? { points: topic.points.trim() } : {}),
            ...(links(topic.links).length
              ? { links: links(topic.links) }
              : {}),
          }
        : null
      : chosen
        ? { kind: 'article', ...chosen }
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
  const closeTo = location.pathname.startsWith('/workshop')
    ? '/workshop'
    : undefined;
  if (step === 2 && source && view)
    return (
      <Step2
        projectId={projectId}
        view={view}
        source={source}
        article={article}
        onChange={() => {
          // From a recommendation or a task the article came with the address: Change opens step 1 to pick another.
          if (given) void navigate({ search: '' }, { replace: true });
          setStep(1);
        }}
        closeTo={closeTo}
      />
    );
  return (
    <RouteDialog
      title={$t('workshop.pick')}
      description={<Steps step={1} />}
      closeTo={closeTo}
      className={DIALOG}
      footer={
        <>
          {tab === 'article' && chosen ? (
            <span className='mr-auto self-center text-sm text-muted-foreground'>
              {$t('workshop.pickedOne')}
            </span>
          ) : null}
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
      ) : !view ? (
        <ListSkeleton rows={5} />
      ) : (
        <Step1
          view={view}
          tab={tab}
          onTab={setTab}
          chosen={chosen}
          onChoose={setChosen}
          topic={topic}
          onTopic={setTopic}
          problem={topicProblem}
        />
      )}
    </RouteDialog>
  );
}

// Both steps and both tabs of step 1 share one size, so the dialog stays put as they change; longer content scrolls.
const DIALOG = 'h-[min(48rem,calc(100dvh-2rem))] sm:max-w-4xl';

const links = (text: string) =>
  [...new Set(text.split(/\s+/).map((s) => s.trim()).filter(Boolean))];

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
        {$t('workshop.stepWhat')}
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

function Step1({
  view,
  tab,
  onTab,
  chosen,
  onChoose,
  topic,
  onTopic,
  problem,
}: {
  view: WorkshopView;
  tab: 'article' | 'topic';
  onTab: (tab: 'article' | 'topic') => void;
  chosen: { url: string; title: string } | null;
  onChoose: (a: { url: string; title: string }) => void;
  topic: { topic: string; points: string; links: string };
  onTopic: (t: { topic: string; points: string; links: string }) => void;
  problem: string;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'clicks' | 'date'>('clicks');
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const found = view.articles.filter(
      (a) => !q || a.title.toLowerCase().includes(q),
    );
    return sort === 'date'
      ? [...found].sort((a, b) =>
          String(b.published || '').localeCompare(String(a.published || '')),
        )
      : found;
  }, [view.articles, query, sort]);
  const sorts = [
    { value: 'clicks', label: $t('workshop.sortClicks') },
    { value: 'date', label: $t('workshop.sortDate') },
  ];
  return (
    <div className='space-y-3'>
      <Tabs value={tab} onValueChange={(v) => onTab(v as 'article' | 'topic')}>
        <TabsList variant='line' className='h-auto! justify-start'>
          <TabsTrigger value='article'>
            {$t('workshop.tabArticles', { 0: view.articles.length })}
          </TabsTrigger>
          <TabsTrigger value='topic'>{$t('workshop.tabTopic')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'article' ? (
        <>
          <div className='flex gap-2'>
            <label className='relative flex flex-1 items-center'>
              <Search className='pointer-events-none absolute left-2.5 size-4 text-muted-foreground' />
              <Input
                aria-label={$t('workshop.searchTitle')}
                placeholder={$t('workshop.searchTitle')}
                className='h-8 pl-8'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <Select
              items={sorts}
              value={sort}
              onValueChange={(v) => setSort(v === 'date' ? 'date' : 'clicks')}
            >
              <SelectTrigger
                size='sm'
                className='w-44'
                aria-label={$t('workshop.sort')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sorts.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!view.articles.length ? (
            <p className='py-6 text-center text-sm text-muted-foreground'>
              {$t('workshop.noArticlesPick')}
            </p>
          ) : !rows.length ? (
            <p className='py-6 text-center text-sm text-muted-foreground'>
              {$t('workshop.noMatch', { 0: query.trim() })}
            </p>
          ) : (
            <RadioGroup
              value={chosen?.url ?? ''}
              onValueChange={(url) => {
                const a = view.articles.find((x) => x.url === url);
                if (a) onChoose({ url: a.url, title: a.title });
              }}
              aria-label={$t('workshop.articleColumn')}
              className='gap-0'
            >
              <div className='grid grid-cols-[1.25rem_1fr_7rem_6rem] gap-3 border-b px-2 pb-1.5 text-xs text-muted-foreground'>
                <span />
                <span>{$t('workshop.articleColumn')}</span>
                <span className='text-right'>
                  {$t('workshop.clicks30Column')}
                </span>
                <span>{$t('workshop.madeColumn')}</span>
              </div>
              <div className='max-h-80 overflow-y-auto'>
                {rows.map((a) => {
                  const n = madeList(a.made).length;
                  return (
                    <label
                      key={a.url}
                      className={cn(
                        'grid cursor-pointer grid-cols-[1.25rem_1fr_7rem_6rem] items-center gap-3 border-b px-2 py-2 text-sm last:border-b-0',
                        chosen?.url === a.url && 'bg-muted/60',
                      )}
                      data-article=''
                    >
                      <RadioGroupItem value={a.url} />
                      <span className='truncate' title={a.title}>
                        {a.title}
                      </span>
                      <span className='text-right tabular-nums'>
                        {formatCount(a.clicks30)}
                      </span>
                      <span className='text-xs text-muted-foreground'>
                        {n
                          ? $t('workshop.madeCount', { 0: n })
                          : $t('workshop.notMade')}
                      </span>
                    </label>
                  );
                })}
              </div>
            </RadioGroup>
          )}
        </>
      ) : (
        <div className='space-y-3'>
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
          {problem ? (
            <p className='text-sm text-destructive'>{problem}</p>
          ) : null}
          <p className='text-sm text-muted-foreground'>
            {$t('workshop.topicHint')}
          </p>
        </div>
      )}
    </div>
  );
}

function Step2({
  projectId,
  view,
  source,
  article,
  onChange,
  closeTo,
}: {
  projectId: string;
  view: WorkshopView;
  source: RepurposeSource;
  article?: Article;
  onChange: () => void;
  closeTo?: string;
}) {
  const navigate = useNavigate();
  const { can } = useBusinessAccess('nrWorkshop.create', projectId);
  const [picked, setPicked] = useState<Map<string, Item>>(() => new Map());
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
  const choice = JSON.stringify([source, [...picked.keys()].sort(), agentId]);
  const [request, setRequest] = useState<{ choice: string; id: string }>();
  const made = article?.made || [];
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
    ...reddit.subreddits.map((s) => ({
      subreddit: s.subreddit,
      note: $t('workshop.redditDiscussions', { 0: s.discussions, 1: reddit.weeks }),
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
      { form: 'community', destination: { kind: 'reddit', subreddit: otherName } },
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
        },
      );
      toast.success(() => $t('workshop.handedOff', { 0: r.taskIds.length }));
      const stuck = r.taskIds.length - r.started.length;
      if (stuck > 0)
        toast.warning(() => $t('workshop.notStarted', { 0: stuck }));
      void navigate('/workshop', { replace: true });
    } catch (e) {
      setFailure(errorText(e, $t('workshop.createFailed')));
    } finally {
      setBusy(false);
    }
  };
  const status = (item: Item) => {
    const key = destinationKey(item.destination);
    const mine = made.filter(
      (m) => m.form === item.form && destinationKey(m.destination) === key,
    );
    const shown =
      mine.find((m) => m.standing === 'done') ||
      mine.find((m) => m.standing !== 'closed');
    return shown ? <MadeNote made={shown} /> : null;
  };
  const names = getFormNames();
  return (
    <RouteDialog
      title={$t('workshop.pick')}
      description={<Steps step={2} />}
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
            disabled={!count || busy || !can || !agentId}
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
        <div
          className='flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm'
          data-source={source.kind}
        >
          <span className='text-muted-foreground'>{$t('workshop.adapt')}</span>
          <b className='min-w-0 font-semibold'>
            {source.kind === 'article'
              ? source.title
              : $t('workshop.topicSource', { 0: source.topic })}
          </b>
          {article ? (
            <span className='text-xs text-muted-foreground'>
              {[
                article.published
                  ? $t('workshop.publishedOn', {
                      0: formatDate(article.published),
                    })
                  : '',
                view.searchConnected
                  ? $t('workshop.clicks7', {
                      0: formatCount(article.clicks7),
                    })
                  : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          ) : null}
          <Button
            variant='link'
            size='sm'
            className='ml-auto h-auto p-0'
            onClick={onChange}
          >
            {$t('workshop.change')}
          </Button>
        </div>
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
            preview={<PostsPreview lines={[[90, 70, 40], [80, 55], [85, 60]]} />}
          />
          <FormCard
            form='linkedin'
            name={names.linkedin}
            spec={$t('workshop.specLinkedin')}
            checked={isOn({ form: 'linkedin' })}
            onCheckedChange={(on) => toggle({ form: 'linkedin' }, on)}
            status={status({ form: 'linkedin' })}
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
                note={$t('workshop.hnNote')}
                checked={isOn({ form: 'community', destination: { kind: 'hn' } })}
                onCheckedChange={(on) =>
                  toggle({ form: 'community', destination: { kind: 'hn' } }, on)
                }
                status={status({
                  form: 'community',
                  destination: { kind: 'hn' },
                })}
              />
            </div>
          </div>
        </div>
        {failure ? (
          <p className='text-sm text-destructive' role='alert'>
            {failure}
          </p>
        ) : null}
      </div>
    </RouteDialog>
  );
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
      {made.standing === 'done'
        ? $t('workshop.madeDone', { 0: taskNo(made.no) })
        : [standingText(made.standing), taskNo(made.no)].filter(Boolean).join(' · ')}
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
}: {
  form: RepurposeForm;
  name: string;
  spec: string;
  preview: ReactNode;
  disabled?: boolean;
  checked?: boolean;
  onCheckedChange?: (on: boolean) => void;
  status?: ReactNode;
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
          !disabled && 'cursor-pointer',
        )}
      >
        <SourceLogo
          source={form === 'xhs' ? 'xiaohongshu' : form}
          size='sm'
        />
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
        disabled={disabled}
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
}: {
  logo: string;
  name: string;
  note?: string;
  checked: boolean;
  onCheckedChange: (on: boolean) => void;
  status?: ReactNode;
}) {
  return (
    <div className='flex flex-wrap items-center gap-2 py-0.5' data-destination=''>
      <label className='flex cursor-pointer items-center gap-2'>
        <Checkbox
          checked={checked}
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

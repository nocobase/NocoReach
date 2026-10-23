import { useMessageState, $t, $legacyText } from '#i18n';
import { useEffect, useRef, useState } from 'react';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { Check, TerminalSquare, X } from 'lucide-react';
import { AgentSetupDialog } from '#components/agent-setup-dialog';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Tag } from '#components/reach/tag';
import { SourceLogo } from '#components/reach/source-logo';
export type Finding = {
  source: string;
  label: string;
  url?: string;
  registry?: string;
  name?: string;
  terms?: string[];
  status: 'direct' | 'optional' | 'auth' | 'unsupported';
  note: string;
  connection: { status: 'connected' | 'replaces' | 'new'; current?: string };
};
type Discovery = {
  origin: string;
  title: string;
  description: string;
  items: Finding[];
};
type Outcome = { state: 'running' | 'done' | 'failed'; message?: string };
const post = <T,>(resource: string, action: string, body: object) =>
  api.action<T>(resource, action, { method: 'POST', body, unwrap: 'data' });
// Connecting a finding reuses each source's own confirmation path; the whole website type set is kept and can be narrowed later.
async function connect(projectId: number, f: Finding) {
  if (f.source === 'site') {
    const d = await post<{ previewId: string; types: Record<string, number> }>(
      'nrSiteContent',
      'discover',
      { projectId, url: f.url },
    );
    await post('nrSiteContent', 'confirm', {
      projectId,
      previewId: d.previewId,
      types: Object.keys(d.types),
    });
    return $t('discoveryBox.pagesRead', {
      0: Object.values(d.types).reduce((a, b) => a + b, 0),
    });
  }
  if (f.source === 'github') {
    await post('nrGitHub', 'connect', { projectId, url: f.url });
    return $t('discoveryBox.connectedSyncsDaily');
  }
  if (f.source === 'discourse') {
    await post('nrCommunity', 'connect', { projectId, url: f.url });
    return $t('discoveryBox.connectedFirstSyncRunningBackground');
  }
  if (f.source === 'packages') {
    await post('nrPackages', 'add', {
      projectId,
      registry: f.registry,
      name: f.name,
    });
    return $t('discoveryBox.connectedReadingDownloads');
  }
  if (f.source === 'mentions') {
    await post('nrHackerNews', 'connect', { projectId, terms: f.terms });
    return $t('discoveryBox.connectedReadingPastYearBackground');
  }
  throw new Error($t('discoveryBox.sourceNeedsConnectedSeparately'));
}
// The kind of connection each finding becomes, named once above its rows: several sources share one
// kind (GA4 and Search Console are one Google authorization, Discord and Slack are both team chat).
const SOURCE_KINDS: Record<string, string> = {
  ga4: 'google',
  gsc: 'google',
  discord: 'chat',
  slack: 'chat',
  social: 'platforms',
  youtube: 'platforms',
  reddit: 'platforms',
  linkedin: 'social',
};
const KINDS: Record<string, { name: string; note: string }> = {
  site: { name: 'discoveryBox.kindSiteName', note: 'discoveryBox.kindSite' },
  github: {
    name: 'discoveryBox.kindGithubName',
    note: 'discoveryBox.githubOneMainRepositoryPerProject',
  },
  discourse: {
    name: 'discoveryBox.kindDiscourseName',
    note: 'discoveryBox.kindDiscourse',
  },
  community: {
    name: 'discoveryBox.kindCommunityName',
    note: 'discoveryBox.kindCommunity',
  },
  packages: {
    name: 'discoveryBox.kindPackagesName',
    note: 'discoveryBox.kindPackages',
  },
  mentions: {
    name: 'discoveryBox.kindHackerNewsName',
    note: 'discoveryBox.kindHackerNews',
  },
  'github-traffic': {
    name: 'discoveryBox.kindGithubTrafficName',
    note: 'discoveryBox.kindGithubTraffic',
  },
  google: {
    name: 'discoveryBox.kindGoogleName',
    note: 'discoveryBox.kindGoogle',
  },
  chat: { name: 'discoveryBox.kindChatName', note: 'discoveryBox.kindChat' },
  platforms: {
    name: 'discoveryBox.kindPlatformsName',
    note: 'discoveryBox.kindPlatforms',
  },
  social: {
    name: 'discoveryBox.kindSocialName',
    note: 'discoveryBox.kindSocial',
  },
};
const kindOf = (source: string) => SOURCE_KINDS[source] ?? source;
// defaultUrl only seeds the field (the project's website right after it is created); discovery still
// waits for the user, and later project refreshes never overwrite what they typed.
// refreshKey changes whenever the page reloads its saved connection state (after a connection panel
// saved, or after this box connected sources): the listed findings then get their connection status
// recomputed from saved state, without reading the homepage again.
// Two ways to start, side by side: the homepage's links, read by rules here, or the person's own agent, which installs
// the NocoReach CLI and connects sources with `nocoreach connect` after they confirm its plan. The findings open in a
// dialog held in component state: they come from one homepage read and stand for no record, so reopening reads again.
export function DiscoveryBox({
  projectId,
  projectName,
  defaultUrl,
  refreshKey,
  open,
  onDone,
}: {
  projectId: number;
  projectName: string;
  defaultUrl?: string;
  refreshKey?: number;
  open: (source: string) => void;
  onDone: () => void;
}) {
  const [agentOpen, setAgentOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const agentRef = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState(defaultUrl ?? ''),
    [found, setFound] = useState<Discovery>(),
    [picked, setPicked] = useState<Set<number>>(() => new Set()),
    [outcomes, setOutcomes] = useState<Record<number, Outcome>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useMessageState('');
  const foundRef = useRef(found);
  foundRef.current = found;
  useEffect(() => {
    const listed = foundRef.current;
    if (!listed || refreshKey === undefined) return;
    let active = true;
    post<{ connections: Finding['connection'][] }>(
      'nrDiscovery',
      'connections',
      { projectId, items: listed.items },
    )
      .then(({ connections }) => {
        // Ignore an answer for a list that has since been replaced by a new discovery.
        if (!active || foundRef.current !== listed) return;
        const items = listed.items.map((f, i) => ({
          ...f,
          connection: connections[i] ?? f.connection,
        }));
        setFound({ ...listed, items });
        // A finding that is now connected, or would now replace something, is no longer picked by default;
        // every other choice the user made stays as it was.
        setPicked((p) => {
          const n = new Set(p);
          items.forEach((f, i) => {
            if (
              f.connection.status !== listed.items[i].connection.status &&
              f.connection.status !== 'new'
            )
              n.delete(i);
          });
          return n;
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [refreshKey, projectId]);
  async function discover() {
    setResultsOpen(true);
    setBusy(true);
    setError('');
    setFound(undefined);
    setOutcomes({});
    try {
      const d = await post<Discovery>('nrDiscovery', 'discover', {
        projectId,
        url,
      });
      setFound(d);
      setPicked(
        new Set(
          d.items
            .map((f, i) =>
              f.status === 'direct' && f.connection.status === 'new' ? i : -1,
            )
            .filter((i) => i >= 0),
        ),
      );
    } catch (e) {
      setError(() =>
        e instanceof Error
          ? $legacyText(e.message)
          : $t('discoveryBox.discoveryNotCompleteCheckUrl'),
      );
    } finally {
      setBusy(false);
    }
  }
  // Each project connects at most one GitHub repository: picking one clears any other picked GitHub finding.
  function pick(i: number, checked: boolean) {
    setPicked((p) => {
      const n = new Set(p);
      if (checked) {
        if (found?.items[i]?.source === 'github')
          for (const j of n)
            if (found.items[j]?.source === 'github') n.delete(j);
        n.add(i);
      } else n.delete(i);
      return n;
    });
  }
  async function connectAll() {
    if (!found) return;
    setBusy(true);
    for (const i of picked) {
      setOutcomes((o) => ({ ...o, [i]: { state: 'running' } }));
      try {
        const message = await connect(projectId, found.items[i]);
        setOutcomes((o) => ({ ...o, [i]: { state: 'done', message } }));
      } catch (e) {
        setOutcomes((o) => ({
          ...o,
          [i]: {
            state: 'failed',
            message:
              e instanceof Error ? e.message : $t('discoveryBox.notConnect'),
          },
        }));
      }
    }
    setBusy(false);
    onDone();
  }
  const groups: [string, Finding['status'][]][] = [
    [$t('discoveryBox.readyConnect'), ['direct', 'optional']],
    [$t('discoveryBox.needsAuthorization'), ['auth']],
    [$t('discoveryBox.notSupportedYet'), ['unsupported']],
  ];
  const finished = found && Object.keys(outcomes).length > 0 && !busy;
  // Connecting writes one source after another; the dialog stays open until the last answer is in.
  const connecting = busy && Boolean(found);
  const host = found ? new URL(found.origin).hostname : '';
  return (
    <section className='nr-discovery-box'>
      <div className='nr-discovery-way'>
        <h2>{$t('discoveryBox.findOnWebsite')}</h2>
        <p className='nr-muted'>
          {$t('discoveryBox.readsHomepageLinksFindWebsite')}
        </p>
        <div className='nr-discovery-input'>
          <input
            aria-label={$t('discoveryBox.websiteAddress')}
            value={url}
            disabled={busy}
            placeholder='https://example.com'
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && url.trim() && !busy) void discover();
            }}
          />
          <Button
            variant='outline'
            disabled={busy || !url.trim()}
            onClick={() => void discover()}
          >
            {$t('discoveryBox.discoverData')}
          </Button>
        </div>
      </div>
      <div className='nr-discovery-way'>
        <h2>
          <TerminalSquare aria-hidden='true' />
          {$t('discoveryBox.useAgent')}
        </h2>
        <p className='nr-muted'>{$t('discoveryBox.useAgentHint')}</p>
        <div>
          <Button ref={agentRef} onClick={() => setAgentOpen(true)}>
            {$t('discoveryBox.copyAgentInstructions')}
          </Button>
        </div>
      </div>
      <AgentSetupDialog
        open={agentOpen}
        onOpenChange={setAgentOpen}
        returnFocus={agentRef}
        connections={{ projectId: String(projectId), projectName }}
      />
      <Dialog
        open={resultsOpen}
        onOpenChange={(next, details) => {
          if (!next && connecting) {
            details.cancel();
            return;
          }
          setResultsOpen(next);
        }}
      >
        <DialogContent
          showCloseButton={!connecting}
          className='flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-2xl'
        >
          <DialogHeader className='shrink-0 pr-6'>
            <DialogTitle>
              {found
                ? $t('discoveryBox.foundSources', {
                    0: host,
                    1: found.items.length,
                  })
                : error
                  ? $t('discoveryBox.findOnWebsite')
                  : $t('discoveryBox.discovering')}
            </DialogTitle>
          </DialogHeader>
          <div className='nr-discovery-result min-h-0 overflow-y-auto'>
            {error && (
              <p className='nr-error' role='alert'>
                {error}
              </p>
            )}
            {!found && !error && (
              <p role='status' className='nr-footnote'>
                {$t('discoveryBox.discovering')}
              </p>
            )}
            {found && (
              <>
                {groups.map(([title, states]) => {
                  const rows = found.items
                    .map((f, i) => [f, i] as const)
                    .filter(([f]) => states.includes(f.status));
                  // Findings of one kind form one block headed by the kind's name and rule, in first-seen order.
                  const blocks: {
                    kind: string;
                    rows: (typeof rows)[number][];
                  }[] = [];
                  for (const row of rows) {
                    const kind = kindOf(row[0].source);
                    const block = blocks.find((b) => b.kind === kind);
                    if (block) block.rows.push(row);
                    else blocks.push({ kind, rows: [row] });
                  }
                  return rows.length ? (
                    <div key={title} className='nr-discovery-group'>
                      <h3>
                        {title}
                        <span className='nr-discovery-count'>
                          {rows.length}
                        </span>
                      </h3>
                      {blocks.map(({ kind, rows: kindRows }) => (
                        <section
                          key={kindRows[0][1]}
                          className='nr-discovery-kind'
                          aria-label={
                            KINDS[kind] ? $t(KINDS[kind].name) : undefined
                          }
                        >
                          {KINDS[kind] && (
                            <header className='nr-discovery-kind-head'>
                              <strong>{$t(KINDS[kind].name)}</strong>
                              <span>{$t(KINDS[kind].note)}</span>
                            </header>
                          )}
                          {kindRows.map(([f, i]) => {
                            const o = outcomes[i];
                            const github = f.source === 'github';
                            return (
                              <div
                                key={i}
                                className='nr-discovery-row'
                                data-status={f.status}
                              >
                                {states[0] === 'direct' ? (
                                  // Repositories are radios (single choice); clicking the picked one clears it.
                                  <input
                                    type={github ? 'radio' : 'checkbox'}
                                    name={
                                      github ? 'discovery-github' : undefined
                                    }
                                    aria-label={$t('common.connectValue', {
                                      0: f.label,
                                    })}
                                    checked={picked.has(i)}
                                    disabled={
                                      busy ||
                                      Boolean(o) ||
                                      f.connection.status === 'connected'
                                    }
                                    // A radio never reports being unchecked, so repositories toggle on click; no
                                    // preventDefault, which leaves a controlled radio's DOM state out of sync.
                                    onChange={(e) => {
                                      if (!github) pick(i, e.target.checked);
                                    }}
                                    onClick={() => {
                                      if (github) pick(i, !picked.has(i));
                                    }}
                                  />
                                ) : null}
                                <SourceLogo
                                  source={f.registry || f.source}
                                  size='sm'
                                />
                                <div>
                                  <strong>{f.label}</strong>
                                  <span className='nr-footnote'>
                                    {o?.message || f.note}
                                  </span>
                                  {f.connection.status === 'replaces' && (
                                    <span className='nr-footnote nr-discovery-warning'>
                                      {$t('discoveryBox.replacementWarning', {
                                        0: f.connection.current,
                                      })}
                                    </span>
                                  )}
                                </div>
                                {f.connection.status === 'connected' && (
                                  <Tag tone='green'>
                                    {$t('discoveryBox.alreadyConnected')}
                                  </Tag>
                                )}
                                {o?.state === 'done' && (
                                  <Check
                                    className='nr-ok'
                                    aria-label={$t('common.connected')}
                                  />
                                )}
                                {o?.state === 'failed' && (
                                  <X
                                    className='nr-fail'
                                    aria-label={$t('discoveryBox.notConnect')}
                                  />
                                )}
                                {o?.state === 'running' && (
                                  <span className='nr-footnote'>
                                    {$t('discoveryBox.connecting')}
                                  </span>
                                )}
                                {f.status === 'auth' &&
                                  f.connection.status !== 'connected' && (
                                    <Button
                                      size='sm'
                                      variant='outline'
                                      onClick={() => {
                                        setResultsOpen(false);
                                        open(f.source);
                                      }}
                                    >
                                      {$t('discoveryBox.authorize')}
                                    </Button>
                                  )}
                              </div>
                            );
                          })}
                        </section>
                      ))}
                    </div>
                  ) : null;
                })}
              </>
            )}
          </div>
          <DialogFooter className='shrink-0 items-center'>
            {finished ? (
              <>
                <p className='nr-footnote mr-auto'>
                  {$t('discoveryBox.doneSourcesNeedAuthorizationAuthorized')}
                </p>
                <DialogClose render={<Button />}>
                  {$t('common.complete')}
                </DialogClose>
              </>
            ) : (
              <>
                <DialogClose
                  disabled={connecting}
                  render={<Button variant='outline' />}
                >
                  {$t('discoveryBox.close')}
                </DialogClose>
                {found && (
                  <Button
                    disabled={busy || !picked.size}
                    onClick={() => void connectAll()}
                  >
                    {busy
                      ? $t('common.connecting')
                      : $t('discoveryBox.connectSelectedSources', {
                          0: picked.size,
                        })}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

import { useMessageState, $t, $legacyText } from '#i18n';
import { useState } from 'react';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { Check, X } from 'lucide-react';
import { ActorAvatar } from '#components/reach/actor';
import { Button } from '#components/ui/button';
import { Tag } from '#components/reach/tag';
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
export function DiscoveryBox({
  projectId,
  open,
  onDone,
}: {
  projectId: number;
  open: (source: string) => void;
  onDone: () => void;
}) {
  const [url, setUrl] = useState(''),
    [found, setFound] = useState<Discovery>(),
    [picked, setPicked] = useState<Set<number>>(() => new Set()),
    [outcomes, setOutcomes] = useState<Record<number, Outcome>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useMessageState('');
  async function discover() {
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
  return (
    <section className='nr-discovery-box'>
      <div className='nr-discovery-head'>
        <ActorAvatar type='agent' size='default' />
        <div>
          <h2>{$t('discoveryBox.enterWebsiteAddressAiFinds')}</h2>
          <p className='nr-muted'>
            {$t('discoveryBox.readsHomepageLinksFindWebsite')}
          </p>
        </div>
      </div>
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
        <Button disabled={busy || !url.trim()} onClick={() => void discover()}>
          {busy && !found
            ? $t('discoveryBox.discovering')
            : $t('discoveryBox.discoverData')}
        </Button>
      </div>
      {error && (
        <p className='nr-error' role='alert'>
          {error}
        </p>
      )}
      {found && (
        <div className='nr-discovery-result'>
          <p className='nr-footnote'>
            {found.title}
            {found.description ? ` — ${found.description}` : ''}
          </p>
          {groups.map(([title, states]) => {
            const rows = found.items
              .map((f, i) => [f, i] as const)
              .filter(([f]) => states.includes(f.status));
            return rows.length ? (
              <div key={title} className='nr-discovery-group'>
                <h3>{title}</h3>
                {rows.map(([f, i]) => {
                  const o = outcomes[i];
                  return (
                    <div
                      key={i}
                      className='nr-discovery-row'
                      data-status={f.status}
                    >
                      {states[0] === 'direct' ? (
                        <input
                          type='checkbox'
                          aria-label={$t('common.connectValue', { 0: f.label })}
                          checked={picked.has(i)}
                          disabled={
                            busy ||
                            Boolean(o) ||
                            f.connection.status === 'connected'
                          }
                          onChange={(e) =>
                            setPicked((p) => {
                              const n = new Set(p);
                              if (e.target.checked) n.add(i);
                              else n.delete(i);
                              return n;
                            })
                          }
                        />
                      ) : (
                        <span className='nr-discovery-dot' />
                      )}
                      <div>
                        <strong>{f.label}</strong>
                        <span className='nr-footnote'>
                          {o?.message || f.note}
                        </span>
                        {f.connection.status === 'replaces' && (
                          <span className='nr-footnote'>
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
                            onClick={() => open(f.source)}
                          >
                            {$t('discoveryBox.authorize')}
                          </Button>
                        )}
                    </div>
                  );
                })}
              </div>
            ) : null;
          })}
          <div className='nr-step-actions'>
            {finished ? (
              <p className='nr-footnote'>
                {$t('discoveryBox.doneSourcesNeedAuthorizationAuthorized')}
              </p>
            ) : (
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
          </div>
        </div>
      )}
    </section>
  );
}

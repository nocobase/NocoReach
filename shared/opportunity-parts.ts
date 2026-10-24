import type { Opportunity, Signal } from './strategy-model.js';

// One opportunity, several tasks (2026-10-22 user decision, after T-34 changed one of the six pages O-43 cited): handing
// off an opportunity proposes one task per place to change. A place is each page a cited change asks to improve or fix
// (a page of the site), the release or repository a change asks to announce (one place for all of them), and one place
// for all the community posts awaiting a reply, which one task drafts and reviews together. Everything else is
// background for every task: changes without a page (site-wide numbers, topic gaps), other people's pages a change
// points to (a GitHub topic, a competitor's page, a video), and site audit issues, which span many pages. An
// opportunity with fewer than two places is handed off as one task, as before. The opportunity is the grouping: there
// are no parent tasks.

export type PartKind = 'page' | 'replies';
export type OpportunityPart = {
  /** `page:<host/path>`, `announce` or `replies`; stable for the same opportunity. */
  key: string;
  kind: PartKind;
  url?: string;
  signalIds: string[];
  /** The playbook its changes point to, by the same rule as a whole opportunity's. */
  playbookId: string;
};
/** The place a task was created for, kept on the task (`evidence.part`) and on its proposal. */
export type TaskPart = {
  key: string;
  kind: PartKind;
  url?: string;
  label: string;
  signalIds: string[];
};

export const MAX_PARTS = 10;

/** The playbook a set of changes points to (the server's defaultPlaybookId and the client's recommendation). */
export function playbookForActions(actions: (string | null | undefined)[]) {
  if (actions.includes('optimize')) return 'optimize-page';
  if (actions.includes('technical')) return 'tech-fix';
  // Posts nobody answered: draft a reply to each (2026-10-08).
  if (actions.includes('reply')) return 'community-reply';
  if (actions.includes('create')) return 'content-outline';
  if (actions.includes('distribute')) return 'release-notes';
  return actions.length ? 'change-research' : 'optimize-page';
}

/** A page whatever the scheme, `www.`, trailing slash, query or fragment; empty for anything but http(s). */
export function pageKey(url: unknown) {
  if (typeof url !== 'string') return '';
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return `${u.host.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '') || '/'}`;
  } catch {
    return '';
  }
}

/** Every place an opportunity's cited changes point to, in the order the opportunity cites them. */
export function partsOf(
  card: Pick<Opportunity, 'signalIds'>,
  signals: Pick<Signal, 'key' | 'url' | 'action'>[],
): OpportunityPart[] {
  const byKey = new Map(signals.map((s) => [s.key, s])),
    parts = new Map<string, OpportunityPart & { actions: string[] }>();
  for (const id of card.signalIds || []) {
    const s = byKey.get(id);
    if (!s) continue;
    const page =
      (s.action === 'optimize' ||
        s.action === 'technical' ||
        s.action === 'distribute') &&
      !s.key.startsWith('audit-')
        ? pageKey(s.url)
        : '';
    const key =
      s.action === 'reply'
        ? 'replies'
        : !page
          ? ''
          : s.action === 'distribute'
            ? 'announce'
            : `page:${page}`;
    if (!key) continue;
    const part = parts.get(key) || {
      key,
      kind: key === 'replies' ? 'replies' : 'page',
      signalIds: [],
      playbookId: '',
      actions: [],
    };
    // An announcement names the release it is about when one is cited, otherwise the first page.
    if (
      page &&
      (!part.url ||
        (key === 'announce' &&
          /\/releases\//.test(String(s.url)) &&
          !/\/releases\//.test(part.url)))
    )
      part.url = String(s.url).trim();
    if (!part.signalIds.includes(s.key)) part.signalIds.push(s.key);
    part.actions.push(s.action || '');
    parts.set(key, part);
  }
  return [...parts.values()]
    .slice(0, MAX_PARTS)
    .map(({ actions, ...part }) => ({
      ...part,
      playbookId: playbookForActions(actions.filter(Boolean)),
    }));
}

/** The places to hand off one by one; none when the opportunity is one task, as before. */
export function splitOf(
  card: Pick<Opportunity, 'signalIds'>,
  signals: Pick<Signal, 'key' | 'url' | 'action'>[],
) {
  const parts = partsOf(card, signals);
  return parts.length > 1 ? parts : [];
}

type PartEvidence = {
  part?: { signalIds?: unknown; url?: unknown } | null;
  insight?: { signalIds?: unknown } | null;
  signalKey?: unknown;
};
const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** The changes a task is about: its place's when it was created for one, otherwise every change it was handed off with. */
export function ownSignalIds(e?: PartEvidence | null): string[] {
  if (e?.part) return strings(e.part.signalIds);
  return [
    ...strings(e?.insight?.signalIds),
    ...(typeof e?.signalKey === 'string' ? [e.signalKey] : []),
  ];
}

/**
 * The cited changes a task reads (its brief's evidence, the Agent's input): a place's own changes plus the
 * opportunity's changes without a page as background, or every change a task handed off as a whole was given.
 */
export function taskSignals<
  S extends { key?: unknown; url?: unknown; action?: unknown },
>(e: PartEvidence | null | undefined, items: S[]): S[] {
  const own = new Set<unknown>(ownSignalIds(e));
  if (!e?.part) return items.filter((s) => own.has(s.key));
  const cited = new Set<unknown>(strings(e.insight?.signalIds));
  return items.filter(
    (s) =>
      own.has(s.key) || (cited.has(s.key) && !s.url && s.action !== 'reply'),
  );
}

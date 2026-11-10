import type { RunnerModelEntry } from '@nocobase/app-plugin-agents/shared/agents';
import {
  listedTools,
  quotaBlocks,
  runsEntry,
  runsTool,
  toolState,
  type Runner,
} from '@nocobase/app-plugin-agents/shared/runners';
import type {
  AgentBlocker,
  RuntimeReadiness,
} from '../../../shared/agent-readiness.js';

type Agent = {
  id: string;
  name: string;
  modelEntries: readonly RunnerModelEntry[];
};
type Viewer = { actor?: string; seesMachines: boolean };

// Most actionable first: a sign-in someone can do now, a quota that comes back on its own, a model to change, a tool
// to install or turn on, then what only waits or needs a closer look.
const RANK: AgentBlocker['kind'][] = [
  'signIn',
  'quota',
  'model',
  'missingTool',
  'toolOff',
  'checking',
  'toolFailed',
  'other',
];

/** The runtimes that would take the person's work: shared with the team or their own, not revoked. */
function usable(runners: readonly Runner[], actor?: string) {
  return runners.filter(
    (r) =>
      r.status !== 'revoked' &&
      (actor === undefined || r.trust === 'team' || r.ownerUserId === actor),
  );
}

const nameFor = (r: Runner, v: Viewer) =>
  v.seesMachines || (v.actor !== undefined && r.ownerUserId === v.actor)
    ? r.name
    : null;

/** Why the agent cannot start the person's work now, for an agent the Agents plugin reports not online. */
export function agentBlocker(
  agent: Agent,
  runners: readonly Runner[],
  viewer: Viewer,
  now: number,
): AgentBlocker {
  const mine = usable(runners, viewer.actor);
  if (!mine.length)
    return runners.some((r) => r.status !== 'revoked')
      ? { kind: 'othersPersonal' }
      : { kind: 'noRuntime' };
  const online = mine.filter((r) => r.status === 'online');
  // Connected, but its Runner speaks a protocol this application no longer serves: the runtime's page says to upgrade.
  const outdated = mine.find((r) => r.status === 'upgrade_required');
  if (!online.length && outdated)
    return { kind: 'other', runtime: nameFor(outdated, viewer) };
  if (!online.length) {
    const latest = [...mine].sort((a, b) =>
      String(b.lastSeenAt ?? '').localeCompare(String(a.lastSeenAt ?? '')),
    )[0];
    return {
      kind: 'offline',
      runtime: nameFor(latest, viewer),
      lastSeenAt: latest.lastSeenAt ?? null,
    };
  }
  const found: AgentBlocker[] = [];
  for (const entry of agent.modelEntries ?? [])
    for (const r of online) {
      const runtime = nameFor(r, viewer),
        tool = entry.tool;
      const state = toolState(r, tool);
      if (state === 'signedOut') found.push({ kind: 'signIn', runtime, tool });
      else if (state === 'notInstalled')
        found.push({ kind: 'missingTool', runtime, tool });
      else if (state === 'off') found.push({ kind: 'toolOff', runtime, tool });
      else if (state === 'checking')
        found.push({ kind: 'checking', runtime, tool });
      else if (state === 'failed' || !runsTool(r, tool))
        found.push({ kind: 'toolFailed', runtime, tool });
      else {
        const blocks = quotaBlocks(r, entry, now);
        if (blocks.length)
          found.push({
            kind: 'quota',
            runtime,
            tool,
            resetsAt: blocks.some((b) => !b.resetsAt)
              ? null
              : new Date(
                  Math.max(
                    ...blocks.map((b) => Date.parse(String(b.resetsAt))),
                  ),
                ).toISOString(),
          });
        else if (entry.model && !runsEntry(r, entry, now))
          found.push({ kind: 'model', runtime, tool, model: entry.model });
        // The tool and model fit; the owner's policy, a full disk or the claim's own rules for this person keep the
        // work away.
        else found.push({ kind: 'other', runtime });
      }
    }
  // The first of the most actionable, in the agent's order of tools and models.
  return (
    [...found].sort(
      (a, b) => RANK.indexOf(a.kind) - RANK.indexOf(b.kind),
    )[0] ?? {
      kind: 'other',
      runtime: nameFor(online[0], viewer),
    }
  );
}

/** How many of the runtimes the person's work could use are online and have a coding tool that can run work now. */
export function runtimeReadiness(
  runners: readonly Runner[],
  viewer: Viewer,
): RuntimeReadiness {
  const mine = usable(runners, viewer.actor);
  const online = mine.filter((r) => r.status === 'online');
  const ready = online.filter((r) =>
    listedTools(r).some((tool) => runsTool(r, tool)),
  );
  const first = online[0];
  const signedOut = first
    ? listedTools(first).filter(
        (tool) => toolState(first, tool) === 'signedOut',
      )
    : [];
  return {
    total: mine.length,
    online: online.length,
    ready: ready.length,
    issue:
      first && !ready.length
        ? {
            kind: signedOut.length ? 'signIn' : 'noTool',
            runtime: nameFor(first, viewer),
            tools: signedOut,
          }
        : null,
  };
}

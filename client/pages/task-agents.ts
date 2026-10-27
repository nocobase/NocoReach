import { $t } from '#i18n';
import { stageName } from './playbook-model';
import { localizeWorkSnapshots } from './playbook-snapshot';
import { isClosed, workState, type Work } from './task-execution-types';

// Tasks by the Agent that does them (Tasks › By Agent, 2026-10-21, after Studio's Agent view): which Agent a task
// runs with, what it is doing, and what waits for a person.

/** The project's Agents as `nrAgent:status` lists them. */
export type AgentStatus = {
  revision?: number;
  agentId?: string | null;
  defaultAgentId?: string | null;
  options?: { id: string; name: string; online?: boolean; busy?: number }[];
};
export type TaskAgent = { id: string; name: string; online?: boolean };
/** The Unassigned column's key and the Agent filter's value for it. */
export const UNASSIGNED = 'none';

/**
 * The Agent a task runs with, as the task page header shows it: its own, else the project default, else the only
 * one available. Null when there is none (Unassigned), also when its own Agent was removed and several remain.
 */
export function taskAgentOf(
  w: Work | undefined,
  status: AgentStatus | undefined,
): TaskAgent | null {
  const options = status?.options || [],
    own = w?.agentId,
    find = (id?: string | null) =>
      id ? options.find((a) => a.id === id) : undefined;
  const chosen = own
    ? find(own)
    : find(status?.defaultAgentId ?? status?.agentId);
  const agent = chosen || (options.length === 1 ? options[0] : undefined);
  return agent
    ? { id: agent.id, name: agent.name, online: agent.online }
    : null;
}

export type Lane = 'running' | 'queued' | 'waiting';
/** What a person has to do for a task waiting in the By Agent view. */
export type Ask = { text: string; tone: 'amber' | 'red' };
export type Placed = { lane: Lane; ask?: Ask; step?: string };

/**
 * Where a current task sits in its Agent's column: working on it, next in line, or waiting for a person (to start
 * it, review, confirm going live, or deal with a failed run). Null for what no one has to act on now: finished,
 * closed, merging or verifying, or tracking impact.
 */
export function placeOf(w: Work | undefined, hasAgent: boolean): Placed | null {
  if (isClosed(w) || workState(w) === 'done') return null;
  if (!w?.flow)
    return {
      lane: 'waiting',
      ask: {
        text: hasAgent
          ? $t('taskAgents.confirmStart')
          : $t('taskAgents.chooseAgentAndStart'),
        tone: 'amber',
      },
    };
  w = localizeWorkSnapshots(w);
  const st = w.flow!.stages[w.stageIndex || 0],
    run = w.latestRun?.status;
  if (!st) return null;
  if (st.kind === 'agent') {
    if (run === 'running') return { lane: 'running', step: stageName(st, w) };
    if (run === 'queued') return { lane: 'queued' };
    if (run === 'failed')
      return {
        lane: 'waiting',
        ask: { text: $t('taskAgents.runFailed'), tone: 'red' },
      };
    return { lane: 'queued' };
  }
  if (st.kind === 'review')
    return { lane: 'waiting', ask: { text: stageName(st), tone: 'amber' } };
  if (st.kind === 'publish')
    return {
      lane: 'waiting',
      ask: { text: $t('common.confirmPublish'), tone: 'amber' },
    };
  if (st.kind === 'release') {
    const s = w.release?.state;
    if (s === 'not_seen')
      return {
        lane: 'waiting',
        ask: { text: $t('taskList.confirmLive'), tone: 'amber' },
      };
    if (s === 'merge_failed')
      return {
        lane: 'waiting',
        ask: { text: $t('taskList.mergeFailed'), tone: 'red' },
      };
  }
  return null;
}

// Why a local agent cannot start a task now, read from what the runtimes report at this moment rather than from how
// past runs ended (2026-11-10 user report: CheeseMac-Isolated was online but its Claude Code and Codex needed sign-in,
// and the Agent page said the runtime was offline). `nrAgent.status` adds it to every agent option that is not online
// (server/nocoreach/execution/agent-readiness.ts); the Agent page, the task board, the task page and the chat panel
// read the same reason.

/**
 * - `noRuntime`: no runtime the person's work could use (none shared with the team, none of their own).
 * - `othersPersonal`: only other people's personal runtimes have it.
 * - `offline`: such runtimes exist, none online; `lastSeenAt` is the latest any was seen.
 * - `signIn`: an online runtime has the agent's coding tool, not signed in.
 * - `quota`: the tool's quota is used up there until `resetsAt` (null: unknown).
 * - `model`: the tool is signed in there but does not offer the agent's model.
 * - `missingTool`: the tool is not installed there; `toolOff`: people turned it off for that runtime.
 * - `checking`: the runtime is still detecting the tool; `toolFailed`: detecting it failed.
 * - `other`: the runtime has the tool and model but takes none of this agent's work now (its owner's policy, a full
 *   disk, a variable the agent needs).
 * `runtime` names the computer for those who may see it (administrators and its owner); null otherwise.
 */
export type AgentBlocker =
  | { kind: 'noRuntime' }
  | { kind: 'othersPersonal' }
  | { kind: 'offline'; runtime: string | null; lastSeenAt: string | null }
  | { kind: 'signIn'; runtime: string | null; tool: string }
  | {
      kind: 'quota';
      runtime: string | null;
      tool: string;
      resetsAt: string | null;
    }
  | { kind: 'model'; runtime: string | null; tool: string; model: string }
  | { kind: 'missingTool'; runtime: string | null; tool: string }
  | { kind: 'toolOff'; runtime: string | null; tool: string }
  | { kind: 'checking'; runtime: string | null; tool: string }
  | { kind: 'toolFailed'; runtime: string | null; tool: string }
  | { kind: 'other'; runtime: string | null };

/**
 * The runtimes the person's work could use (shared with the team, or their own) and how many are online and have a
 * coding tool that can run work now. While none has, `issue` says why on the first online one: its tools need sign-in
 * (`tools` lists them), or no tool is ready for another reason.
 */
export type RuntimeReadiness = {
  total: number;
  online: number;
  ready: number;
  issue: {
    kind: 'signIn' | 'noTool';
    runtime: string | null;
    tools: string[];
  } | null;
};

/** The command that signs a coding tool in, run in a terminal on the runtime's computer; Pi has none of its own. */
export const TOOL_SIGN_IN: Readonly<Record<string, string>> = {
  claude: 'claude auth login',
  codex: 'codex login',
  opencode: 'opencode auth login',
};

export const TOOL_NAMES: Readonly<Record<string, string>> = {
  claude: 'Claude Code',
  codex: 'Codex',
  opencode: 'OpenCode',
  pi: 'Pi',
};

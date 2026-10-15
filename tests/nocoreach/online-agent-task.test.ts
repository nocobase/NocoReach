// @vitest-environment node
import { expect, test, vi } from 'vitest';
import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import type { TaskService } from '../../server/nocoreach/execution/service.js';
import type { Run } from '../../server/nocoreach/execution/model.js';
import type { LegacyTransaction } from '../../server/nocoreach/legacy/database.js';
import { TaskBusiness } from '../../server/nocoreach/execution/task-business.js';
import { OnlineTaskRuntime } from '../../server/nocoreach/online-agent/task-runtime.js';
import type { OnlineRun } from '../../shared/online-agent.js';

test('cancelling a draft tool waiting for the business lock prevents a later write', async () => {
  const abort = new AbortController();
  let unlock!: () => void;
  const wait = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const run = {
    id: 'run',
    projectId: 'project',
    taskId: 'task',
    status: 'running',
    input: '{}',
  } as Run;
  const put = vi.fn();
  const lock = vi.fn(
    async (
      _project: string,
      _task: string,
      callback: (tx: LegacyTransaction) => Promise<unknown>,
    ) => {
      await wait;
      return callback({} as LegacyTransaction);
    },
  );
  const tasks = { lock, put } as unknown as TaskService;
  const business = new TaskBusiness(tasks, {} as Agents);
  tasks.business = business;
  vi.spyOn(business, 'prepareRun').mockResolvedValue(undefined);
  const runtime = new OnlineTaskRuntime(tasks, () => {
    throw new Error('Not needed for tools');
  });
  vi.spyOn(runtime, 'current').mockResolvedValue(run);
  const context = await runtime.prepare(
    { instructions: '' } as OnlineRun,
    abort.signal,
  );
  const tool = context.tools.find((tool) => tool.name === 'task_draft')!;
  const result = tool.execute({ content: 'Late candidate' }, abort.signal);
  await vi.waitFor(() => expect(lock).toHaveBeenCalled());
  abort.abort(new Error('Cancelled while waiting for lock'));
  unlock();
  await expect(result).rejects.toBe(abort.signal.reason);
  expect(put).not.toHaveBeenCalled();
});

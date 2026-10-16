import { expect, it, vi } from 'vitest';
import {
  CreatedTaskStarter,
  creationStartState,
} from '../../client/pages/task-create-start.js';
import type { TaskData } from '../../client/pages/task-execution-types.js';

function view(revision = 0): TaskData {
  return {
    task: { id: 42, title: 'Task', brief: 'Criteria' },
    work: {
      revision,
      stage: 'plan',
      plan: null,
      planVersion: 0,
      step: 0,
      results: [],
      history: [],
    },
    runs: [],
    artifacts: [],
    reviews: [],
  };
}
const queued = (): TaskData => ({
  ...view(2),
  runs: [
    {
      id: 'run',
      status: 'queued',
      planVersion: 0,
      stepId: 'plan',
      createdAt: '',
    },
  ],
});

it('sets the selected Agent before starting at the returned revision', async () => {
  const call = vi
    .fn()
    .mockResolvedValueOnce(view())
    .mockResolvedValueOnce({
      ...view(1),
      work: { ...view(1).work, agentId: 'agent' },
    })
    .mockResolvedValueOnce(queued());
  const starter = new CreatedTaskStarter(call);
  expect(creationStartState(await starter.start('agent', 'research'))).toBe(
    'queued',
  );
  expect(
    call.mock.calls.map(([action, body]) => [action, body?.command]),
  ).toEqual([
    ['get', undefined],
    ['advance', 'setAgent'],
    ['advance', 'startTask'],
  ]);
  expect(call.mock.calls[2][1]).toMatchObject({
    revision: 1,
    playbookId: 'research',
  });
  expect(call.mock.calls[1][1].requestId).not.toBe(
    call.mock.calls[2][1].requestId,
  );
});

it('reconciles an unknown start response and replays exactly the same request', async () => {
  const call = vi
    .fn()
    .mockResolvedValueOnce(view())
    .mockRejectedValueOnce(new TypeError('response lost'))
    .mockRejectedValueOnce(new TypeError('read unavailable'));
  const starter = new CreatedTaskStarter(call);
  await expect(starter.start(null, 'research')).rejects.toThrow(
    'response lost',
  );
  const original = call.mock.calls[1][1];
  expect(starter.pending).toEqual(original);
  call.mockResolvedValueOnce(queued());
  await starter.start(null, 'research');
  expect(call.mock.calls[3]).toEqual(['advance', original]);
  expect(starter.pending).toBeUndefined();
  expect(call).toHaveBeenCalledTimes(4);
});

it('does not start twice when reconciliation observes a queued run', async () => {
  const call = vi
    .fn()
    .mockResolvedValueOnce(view())
    .mockRejectedValueOnce(new TypeError('response lost'))
    .mockResolvedValueOnce(queued());
  const starter = new CreatedTaskStarter(call);
  await expect(starter.start(null, 'research')).rejects.toThrow();
  call.mockResolvedValueOnce(queued());
  await starter.start(null, 'research');
  const advances = call.mock.calls.filter(([action]) => action === 'advance');
  expect(advances).toHaveLength(2);
  expect(advances[0][1]).toEqual(advances[1][1]);
});

it('uses a fresh version and request after a definitive conflict', async () => {
  const call = vi
    .fn()
    .mockResolvedValueOnce(view())
    .mockRejectedValueOnce(
      Object.assign(new Error('conflict'), { status: 409 }),
    )
    .mockResolvedValueOnce(view(3));
  const starter = new CreatedTaskStarter(call);
  await expect(starter.start(null, 'research')).rejects.toThrow('conflict');
  expect(starter.pending).toBeUndefined();
  call.mockResolvedValueOnce(view(4)).mockResolvedValueOnce(queued());
  await starter.start(null, 'research');
  expect(call.mock.calls[4][1].revision).toBe(4);
  expect(call.mock.calls[4][1].requestId).not.toBe(
    call.mock.calls[1][1].requestId,
  );
});

it('does not start after Agent selection is denied', async () => {
  const call = vi
    .fn()
    .mockResolvedValueOnce(view())
    .mockRejectedValueOnce(Object.assign(new Error('denied'), { status: 403 }))
    .mockResolvedValueOnce(view());
  await expect(
    new CreatedTaskStarter(call).start('restricted', 'research'),
  ).rejects.toThrow('denied');
  expect(
    call.mock.calls.filter(([, body]) => body?.command === 'startTask'),
  ).toHaveLength(0);
});

it('preserves an Agent corrected in task details after the first start failed', async () => {
  const assigned = view(1);
  assigned.work.agentId = 'original';
  const call = vi
    .fn()
    .mockResolvedValueOnce(view())
    .mockResolvedValueOnce(assigned)
    .mockRejectedValueOnce(
      Object.assign(new Error('start rejected'), { status: 403 }),
    )
    .mockResolvedValueOnce(assigned);
  const starter = new CreatedTaskStarter(call);
  await expect(starter.start('original', 'research')).rejects.toThrow();
  const corrected = view(2);
  corrected.work.agentId = 'corrected';
  call.mockResolvedValueOnce(corrected).mockResolvedValueOnce(queued());
  await starter.start('original', 'research');
  expect(call.mock.calls[5][1]).toMatchObject({
    command: 'startTask',
    revision: 2,
  });
  expect(
    call.mock.calls.filter(([, body]) => body?.command === 'setAgent'),
  ).toHaveLength(1);
});

it('uses existing stage retry for an entered flow waiting for prerequisites', async () => {
  const waiting = view(1);
  waiting.work.flow = {
    id: 'research',
    name: 'Research',
    version: 1,
    stages: [{ key: 'plan', name: 'Plan', kind: 'agent' }],
  };
  waiting.work.stage = 'flow';
  const call = vi
    .fn()
    .mockResolvedValueOnce(waiting)
    .mockResolvedValueOnce(queued());
  expect(
    creationStartState(
      await new CreatedTaskStarter(call).start(null, 'research'),
    ),
  ).toBe('queued');
  expect(call.mock.calls[1][1]).toMatchObject({
    command: 'retryStage',
    stageKey: 'plan',
    revision: 1,
  });
});

it('does not retry closed tasks, human review or an already active execution', async () => {
  const closed = view();
  closed.work.cancelledAt = 'now';
  const review = view();
  review.work.flow = {
    id: 'review',
    name: 'Review',
    version: 1,
    stages: [{ key: 'review', name: 'Review', kind: 'review' }],
  };
  for (const data of [closed, review, queued()]) {
    const call = vi.fn().mockResolvedValue(data);
    await new CreatedTaskStarter(call).start(null, 'research');
    expect(call).toHaveBeenCalledTimes(1);
  }
  expect(
    creationStartState({
      ...queued(),
      runs: [{ ...queued().runs[0], status: 'running' }],
    }),
  ).toBe('running');
  expect(creationStartState()).toBe('waiting');
  expect(creationStartState(closed)).toBe('closed');
  expect(creationStartState(review)).toBe('review');
  expect(
    creationStartState({ ...view(), work: { ...view().work, stage: 'done' } }),
  ).toBe('completed');
});

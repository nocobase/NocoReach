import { expect, it, vi } from 'vitest';
import { nocobaseClient } from '../../client/lib/nocoreach-api';
import { xiaohongshuRequest } from '../../client/pages/xiaohongshu-api';

vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { action: vi.fn() },
}));

it('sends the initiating confirmation session as a request precondition', async () => {
  await xiaohongshuRequest(2, 'disconnect', { revision: 7 }, 'session-a');
  expect(nocobaseClient.action).toHaveBeenCalledWith(
    'nrXiaohongshu',
    'disconnect',
    {
      method: 'POST',
      body: { projectId: 2, revision: 7 },
      unwrap: 'data',
      headers: { 'X-NocoReach-Confirmation-Session': 'session-a' },
    },
  );
});

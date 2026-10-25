import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import { CommunityConnect } from '../../client/pages/community-connect';
import { PackagesConnect } from '../../client/pages/packages-connect';
import { HackerNewsConnect } from '../../client/pages/hackernews-connect';
import { RedditConnect } from '../../client/pages/reddit-connect';
import { TrendsConnect } from '../../client/pages/trends-connect';
import { XConnect } from '../../client/pages/x-connect';

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { action, wrapRequests: vi.fn() },
}));
vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: () => ({ can: false }),
}));

beforeEach(() => {
  setDictionary(english);
  action.mockReset().mockResolvedValue({ connected: false, locations: [] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setDictionary(null);
});

for (const [name, Component] of [
  ['community', CommunityConnect],
  ['packages', PackagesConnect],
  ['hackernews', HackerNewsConnect],
  ['reddit', RedditConnect],
  ['trends', TrendsConnect],
  ['x', XConnect],
] as const) {
  test(`${name}: status loads once per project, not once per render`, async () => {
    const onChange = vi.fn();
    const view = render(<Component projectId={7} onChange={onChange} />);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await act(async () => {
      view.rerender(<Component projectId={7} onChange={vi.fn()} />);
    });
    expect(action).toHaveBeenCalledTimes(1);
    view.rerender(<Component projectId={8} onChange={onChange} />);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(action).toHaveBeenLastCalledWith(
      expect.any(String),
      'status',
      expect.objectContaining({ body: { projectId: 8 } }),
    );
  });
}

test('community polling stops when synchronization finishes and on unmount', async () => {
  vi.useFakeTimers();
  action.mockResolvedValueOnce({ connected: false, syncing: true });
  const onChange = vi.fn();
  const view = render(<CommunityConnect projectId={7} onChange={onChange} />);
  await act(async () => {});
  expect(action).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(action).toHaveBeenCalledTimes(2);
  expect(onChange).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(action).toHaveBeenCalledTimes(2);

  action.mockResolvedValue({ connected: false, syncing: true });
  view.rerender(<CommunityConnect projectId={8} onChange={onChange} />);
  await act(async () => {});
  expect(action).toHaveBeenCalledTimes(3);
  view.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(action).toHaveBeenCalledTimes(3);
});

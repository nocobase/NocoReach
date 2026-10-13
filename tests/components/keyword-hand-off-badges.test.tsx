import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { KeywordHandOffDialog } from '../../client/pages/keyword-hand-off';
import { SectionHandOff } from '../../client/pages/section-hand-off';
const api = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('../../client/lib/nocoreach-api', () => ({ nocobaseClient: api }));
vi.mock('../../client/i18n', async () => {
  const { useState } = await import('react');
  return {
    $t: (key: string) => key,
    $legacyText: (text: string) => text,
    useMessageState: useState,
  };
});
vi.mock('../../client/pages/keyword-api', () => ({
  marketLabel: () => '',
  metric: () => '',
}));
vi.mock('../../client/components/seo/intent-badge', () => ({
  getIntentLabels: () => ({ unknown: '' }),
  toIntent: () => 'unknown',
}));
vi.mock('../../client/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));
vi.mock('../../client/components/ui/dialog', () => {
  const Box = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ children }: { children: ReactNode }) => (
      <div role='dialog'>{children}</div>
    ),
    DialogContent: Box,
    DialogDescription: Box,
    DialogFooter: Box,
    DialogHeader: Box,
    DialogTitle: Box,
  };
});
vi.mock('../../client/pages/strategy/hand-off', () => ({
  HandOffNotice: ({ result }: { result?: { ok: boolean } }) => (
    <output>{result?.ok ? 'created' : ''}</output>
  ),
}));
const draft = {
  title: 'Standalone work',
  objective: 'Goal',
  brief: 'Evidence',
};
const keyword = {
  keyword: 'search',
  market: null,
  volume: null,
  difficulty: null,
  intent: null,
};
beforeEach(() => {
  api.action.mockReset();
});
function respond({ fail = false, missing = false, linkFail = false } = {}) {
  api.action.mockImplementation((resource: string, action: string) => {
    if (resource === 'nrTaskWork')
      return linkFail
        ? Promise.reject(new Error('page unavailable'))
        : Promise.resolve({ work: { revision: 1 } });
    if (action === 'state')
      return Promise.resolve({ revision: 1, proposals: [] });
    if (action === 'confirmDirection')
      return fail
        ? Promise.reject(new Error('create failed'))
        : Promise.resolve({
            proposals: missing ? [] : [{ id: 'proposal', taskId: 99 }],
          });
    throw new Error('Unexpected request ' + resource + '/' + action);
  });
}
function renderEntry(
  entry: 'keyword' | 'section',
  onDone = vi.fn(),
  page?: string,
) {
  if (entry === 'keyword')
    return render(
      <KeywordHandOffDialog
        projectId={1}
        rows={[keyword]}
        onClose={() => {}}
        onDone={onDone}
      />,
    );
  const view = render(
    <SectionHandOff
      projectId={1}
      draft={() => draft}
      playbookId='optimize-page'
      page={page}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'common.handOffAgent' }));
  return view;
}
it.each(['keyword', 'section'] as const)(
  '%s handoff publishes a badge refresh through the real creation success path',
  async (entry) => {
    respond();
    const refreshed = vi.fn(),
      onDone = vi.fn();
    window.addEventListener('nocoreach:badges', refreshed);
    try {
      renderEntry(entry, onDone);
      await waitFor(() => expect(refreshed).toHaveBeenCalledTimes(1));
      expect(api.action).toHaveBeenCalledWith(
        'nrStrategy',
        'confirmDirection',
        expect.objectContaining({
          body: expect.objectContaining({ projectId: '1', revision: 1 }),
        }),
      );
      if (entry === 'keyword')
        expect(onDone).toHaveBeenCalledWith(
          expect.objectContaining({ taskId: 99, started: false }),
        );
      else {
        await screen.findByText('created');
        expect(screen.queryByRole('dialog')).toBeNull();
      }
    } finally {
      window.removeEventListener('nocoreach:badges', refreshed);
    }
  },
);
it.each(['keyword', 'section'] as const)(
  '%s handoff failure publishes neither a badge refresh nor a success notice',
  async (entry) => {
    respond({ fail: true });
    const refreshed = vi.fn(),
      onDone = vi.fn();
    window.addEventListener('nocoreach:badges', refreshed);
    try {
      renderEntry(entry, onDone);
      await screen.findByRole('alert');
      expect(refreshed).not.toHaveBeenCalled();
      expect(onDone).not.toHaveBeenCalled();
      expect(screen.queryByText('created')).toBeNull();
    } finally {
      window.removeEventListener('nocoreach:badges', refreshed);
    }
  },
);
it('a response without a created task ID does not announce success', async () => {
  respond({ missing: true });
  const refreshed = vi.fn(),
    onDone = vi.fn();
  window.addEventListener('nocoreach:badges', refreshed);
  try {
    renderEntry('keyword', onDone);
    await screen.findByRole('alert');
    expect(refreshed).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener('nocoreach:badges', refreshed);
  }
});
it('optional page-link failure retains the successful task creation refresh', async () => {
  respond({ linkFail: true });
  const refreshed = vi.fn();
  window.addEventListener('nocoreach:badges', refreshed);
  try {
    renderEntry('section', vi.fn(), 'https://example.com/page');
    await screen.findByText('created');
    expect(refreshed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  } finally {
    window.removeEventListener('nocoreach:badges', refreshed);
  }
});

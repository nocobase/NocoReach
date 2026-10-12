import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { confirmAction } from '../../client/components/reach/confirm';

const ask = { title: 'Confirm action', action: 'Confirm' };
afterEach(() => {
  const dialog = screen.queryByRole('alertdialog');
  if (dialog)
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
});
it('does not open a confirmation for an already aborted owner', async () => {
  const owner = new AbortController();
  owner.abort();
  await expect(confirmAction({ ...ask, signal: owner.signal })).resolves.toBe(
    false,
  );
  expect(screen.queryByRole('alertdialog')).toBeNull();
});
it('resolves false and removes a pending confirmation when its owner aborts', async () => {
  const owner = new AbortController();
  let result!: Promise<boolean>;
  act(() => {
    result = confirmAction({ ...ask, signal: owner.signal });
  });
  await screen.findByRole('alertdialog');
  act(() => owner.abort());
  await expect(result).resolves.toBe(false);
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
});
it('handles abort before the separate confirmation root renders', async () => {
  const owner = new AbortController();
  let result!: Promise<boolean>;
  act(() => {
    result = confirmAction({ ...ask, signal: owner.signal });
    owner.abort();
  });
  await expect(result).resolves.toBe(false);
  expect(screen.queryByRole('alertdialog')).toBeNull();
});
it('an older owner cannot dismiss a newer confirmation', async () => {
  const oldOwner = new AbortController();
  let oldResult!: Promise<boolean>;
  let newResult!: Promise<boolean>;
  act(() => {
    oldResult = confirmAction({ ...ask, signal: oldOwner.signal });
  });
  await screen.findByRole('alertdialog');
  act(() => {
    newResult = confirmAction({ ...ask, title: 'New confirmation' });
  });
  await screen.findByText('New confirmation');
  act(() => oldOwner.abort());
  await expect(oldResult).resolves.toBe(false);
  expect(screen.getByRole('alertdialog')).toBeVisible();
  fireEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Confirm',
    }),
  );
  await expect(newResult).resolves.toBe(true);
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
});
it('removes the abort listener after a normal confirmation', async () => {
  const owner = new AbortController();
  const remove = vi.spyOn(owner.signal, 'removeEventListener');
  let result!: Promise<boolean>;
  act(() => {
    result = confirmAction({ ...ask, signal: owner.signal });
  });
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: 'Confirm',
    }),
  );
  await expect(result).resolves.toBe(true);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  act(() => owner.abort());
  await expect(result).resolves.toBe(true);
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
});

it('resolves false and removes the dialog when the user cancels', async () => {
  let result!: Promise<boolean>;
  act(() => {
    result = confirmAction(ask);
  });
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: '取消',
    }),
  );
  await expect(result).resolves.toBe(false);
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
});

it('updates its independent dialog root across locale changes without replacing the pending intent', async () => {
  const { setDictionary } = await import('../../client/i18n');
  const { default: english } = await import('../../shared/i18n/en.json');
  let result!: Promise<boolean>;
  act(() => {
    result = confirmAction({
      title: 'xiaohongshu.disconnectXiaohongshuCollector',
      description: () => 'Custom {0}',
      action: 'common.disconnect',
    });
  });
  await screen.findByRole('alertdialog');
  act(() => setDictionary(english));
  expect(
    screen.getByText(english['xiaohongshu.disconnectXiaohongshuCollector']),
  ).toBeVisible();
  expect(screen.getByText('Custom {0}')).toBeVisible();
  fireEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: english['common.cancel'],
    }),
  );
  await expect(result).resolves.toBe(false);
  act(() => setDictionary(null));
});

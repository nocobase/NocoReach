import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { Reveal } from '../../client/components/reach/reveal';

afterEach(cleanup);

// 2026-10-24 user report: the button turned into a bare Collapse and the content opened out of view, so nothing
// seemed to happen.
test('the button keeps its label when open and brings what opened into view', async () => {
  const user = userEvent.setup();
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  render(<Reveal label='Release notes'>The note</Reveal>);
  const button = screen.getByRole('button', { name: 'Release notes' });
  expect(button).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('The note')).toBeNull();
  await user.click(button);
  expect(button).toHaveAttribute('aria-expanded', 'true');
  expect(button).toHaveAccessibleName('Release notes');
  expect(screen.getByText('The note')).toBeVisible();
  expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
  await user.click(button);
  expect(screen.queryByText('The note')).toBeNull();
});

test('content open from the start is not scrolled to', () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  render(
    <Reveal label='Release notes' defaultOpen>
      The note
    </Reveal>,
  );
  expect(screen.getByText('The note')).toBeVisible();
  expect(scroll).not.toHaveBeenCalled();
});

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import { AddImageButton } from '../../client/pages/task-detail/task-images';

// 2026-11-04 user request: the task's message box takes images as a chat box does, with the right-side chat
// composer's attach button and no line of hints beside it.

beforeEach(() => {
  cleanup();
  setDictionary(english);
});
afterEach(() => setDictionary(null));

it("is the chat composer's attach button, named Add image, with no hints beside it", () => {
  const onFiles = vi.fn();
  const { container } = render(<AddImageButton onFiles={onFiles} />);
  const add = screen.getByRole('button', { name: 'Add image' });
  expect(add).toHaveAttribute('title', 'Add image');
  expect(add).toHaveClass('rounded-full', 'text-muted-foreground');
  expect(add.querySelector('svg.lucide-paperclip')).not.toBeNull();
  expect(container).not.toHaveTextContent(/PNG|paste|drop/i);
  const picker = container.querySelector<HTMLInputElement>('input[type=file]')!;
  expect(picker).not.toBeVisible();
  const image = new File(['png'], 'workspace.png', { type: 'image/png' });
  fireEvent.change(picker, { target: { files: [image] } });
  expect(onFiles).toHaveBeenCalledWith([image]);
});

it('is disabled once a message has all the images it takes', () => {
  render(<AddImageButton disabled onFiles={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Add image' })).toBeDisabled();
});

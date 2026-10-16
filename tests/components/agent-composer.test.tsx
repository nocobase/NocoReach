import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { MessageAttachment } from '@nocobase/app-plugin-agents/shared/conversations';
import { expect, test, vi } from 'vitest';
import { AgentComposer } from '../../client/components/agent-composer';

test('attachment-only drafts report dirty and abort/discard late uploads when a confirmed switch unmounts the composer', async () => {
  let complete!: (attachment: MessageAttachment) => void;
  const upload = vi.fn(
    (_file: File, _signal?: AbortSignal) =>
      new Promise<MessageAttachment>((resolve) => {
        complete = resolve;
      }),
  );
  const discard = vi.fn(),
    dirty = vi.fn();
  const view = render(
    <AgentComposer
      onSend={() => true}
      onDirtyChange={dirty}
      attachments={{ upload, discard }}
    />,
  );
  fireEvent.change(screen.getByTestId('chat-attach-input'), {
    target: {
      files: [new File(['draft'], 'draft.txt', { type: 'text/plain' })],
    },
  });
  await waitFor(() => expect(dirty).toHaveBeenLastCalledWith(true));
  const signal = upload.mock.calls[0]?.[1];
  expect(signal?.aborted).toBe(false);
  view.unmount();
  expect(signal?.aborted).toBe(true);
  expect(dirty).toHaveBeenLastCalledWith(false);
  const attachment: MessageAttachment = {
    id: 'file',
    filename: 'draft.txt',
    ext: 'txt',
    mimeType: 'text/plain',
    size: 5,
    contentUrl: '/file',
    downloadUrl: '/file',
    previewable: false,
  };
  await act(async () => complete(attachment));
  expect(discard).toHaveBeenCalledWith(attachment);
});

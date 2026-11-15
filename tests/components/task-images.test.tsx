import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import {
  AttachButton,
  ComposerDocuments,
  MessageDocuments,
} from '../../client/pages/task-detail/task-images';
import {
  imageProblem,
  messageFileProblem,
  readMessageFiles,
} from '../../client/pages/task-detail/task-images-model';
import {
  MESSAGE_FILE_ACCEPT,
  TASK_IMAGE_ACCEPT,
} from '../../shared/task-images';

// 2026-11-04 user request: the task's message box takes images as a chat box does, with the right-side chat
// composer's attach button and no line of hints beside it. 2026-11-15: it takes the documents a new task takes too.

beforeEach(() => {
  cleanup();
  setDictionary(english);
});
afterEach(() => setDictionary(null));

const file = (name: string, type = '', size = 10) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

it("is the chat composer's attach button, named Add attachment, with no hints beside it", () => {
  const onFiles = vi.fn();
  const { container } = render(<AttachButton onFiles={onFiles} />);
  const add = screen.getByRole('button', { name: 'Add attachment' });
  expect(add).toHaveAttribute('title', 'Add attachment');
  expect(add).toHaveClass('rounded-full', 'text-muted-foreground');
  expect(add.querySelector('svg.lucide-paperclip')).not.toBeNull();
  expect(container).not.toHaveTextContent(/PNG|paste|drop/i);
  const picker = container.querySelector<HTMLInputElement>('input[type=file]')!;
  expect(picker).not.toBeVisible();
  // The images and the documents a new task takes; no videos.
  expect(picker.accept).toBe(MESSAGE_FILE_ACCEPT);
  expect(picker.accept.split(',')).toEqual(
    expect.arrayContaining([
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      '.docx',
      '.xlsx',
      '.pdf',
      '.csv',
      '.md',
      '.txt',
    ]),
  );
  expect(picker.accept).not.toMatch(/video/);
  const notes = file('notes.md');
  fireEvent.change(picker, { target: { files: [notes] } });
  expect(onFiles).toHaveBeenCalledWith([notes]);
});

it('is disabled once a message has all the files it takes', () => {
  render(<AttachButton disabled onFiles={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Add attachment' })).toBeDisabled();
});

describe('which files each input takes', () => {
  it('lets a message or change request take documents and say which types it accepts otherwise', () => {
    for (const ok of [
      file('shot.png', 'image/png'),
      file('notes.md'),
      file('notes.markdown', 'text/markdown'),
      file('feedback.txt', 'text/plain'),
      file('brief.docx'),
      file('figures.xlsx'),
      file('report.pdf', 'application/pdf'),
      file('rows.csv', 'text/csv'),
    ])
      expect(messageFileProblem(ok, 0, 10), ok.name).toBe('');
    const accepted =
      'A message accepts PNG, JPG, WebP and GIF images, and Word (.docx), Excel (.xlsx), PDF, CSV, Markdown (.md) and plain text (.txt) files.';
    expect(messageFileProblem(file('demo.mp4', 'video/mp4'), 0, 10)).toBe(
      `demo.mp4 cannot be attached. ${accepted}`,
    );
    expect(messageFileProblem(file('site.zip', 'application/zip'), 0, 10)).toBe(
      `site.zip cannot be attached. ${accepted}`,
    );
    expect(messageFileProblem(file('old.doc'), 0, 10)).toBe(
      'old.doc is in a legacy or macro-enabled Office format. Save it as .docx or .xlsx and add it again.',
    );
    expect(
      messageFileProblem(
        file('big.txt', 'text/plain', 21 * 1024 * 1024),
        0,
        10,
      ),
    ).toBe('big.txt is larger than 20 MB.');
    // Images and documents count together, as a new task's attachments do.
    expect(messageFileProblem(file('more.md'), 10, 10)).toBe(
      'A message takes up to 10 attachments.',
    );
  });

  it('keeps the article body, Edit directly and the cover to images, with their own message', () => {
    // article-body-editor.tsx, markdown-editor.tsx (usePastedImages) and article-cover.tsx check with imageProblem.
    expect(TASK_IMAGE_ACCEPT).toBe('image/png,image/jpeg,image/webp,image/gif');
    expect(imageProblem(file('notes.md'), 0, Infinity)).toBe(
      'notes.md is not a PNG, JPG, WebP or GIF image.',
    );
    expect(imageProblem(file('feedback.txt', 'text/plain'), 0, 1)).toBe(
      'feedback.txt is not a PNG, JPG, WebP or GIF image.',
    );
    expect(imageProblem(file('shot.png', 'image/png'), 0, 1)).toBe('');
  });
});

describe('a message draft', () => {
  const image = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'shot.png',
    ref: '/uploads/task-media/11111111-1111-4111-8111-111111111111.png',
  };
  const document = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'feedback.txt',
    ref: '/uploads/task-media/22222222-2222-4222-8222-222222222222.txt',
    type: 'text/plain',
    size: 120,
  };

  it('keeps images and documents in the order they were added, and reads a draft from before documents', () => {
    expect(readMessageFiles(JSON.stringify([document, image]))).toEqual([
      document,
      image,
    ]);
    expect(readMessageFiles(JSON.stringify([image]))).toEqual([image]);
    // Anything else is left out rather than sent.
    expect(
      readMessageFiles(
        JSON.stringify([{ ...document, type: 'video/mp4' }, { id: 1 }, null]),
      ),
    ).toEqual([]);
    expect(readMessageFiles('not json')).toEqual([]);
    expect(readMessageFiles('')).toEqual([]);
  });
});

it('shows each document being added as a chip with its name, a spinner while it uploads and a way to remove it', () => {
  const onRemove = vi.fn();
  render(
    <ComposerDocuments
      documents={[
        { key: 'a', name: 'notes.md', size: 2048 },
        {
          key: 'b',
          name: 'feedback.txt',
          size: 120,
          document: {
            id: 'b',
            name: 'feedback.txt',
            ref: '/uploads/task-media/b.txt',
            type: 'text/plain',
            size: 120,
          },
        },
      ]}
      onRemove={onRemove}
    />,
  );
  const list = screen.getByRole('list', { name: 'Documents' });
  expect(list).toHaveTextContent('notes.md');
  expect(list).toHaveTextContent('feedback.txt');
  expect(screen.getByLabelText('Uploading notes.md…')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Remove feedback.txt' }));
  expect(onRemove).toHaveBeenCalledWith('b');
});

it("lists a sent message's documents as a new task's are on the task: each previews or downloads", () => {
  render(
    <MessageDocuments
      documents={[
        {
          id: 'd1',
          name: 'feedback.txt',
          ref: '/uploads/task-media/d1.txt',
          type: 'text/plain',
          size: 120,
        },
      ]}
    />,
  );
  expect(
    screen.getByRole('button', { name: 'Preview feedback.txt' }),
  ).toBeTruthy();
  expect(screen.getByLabelText('Download feedback.txt')).toHaveAttribute(
    'href',
    expect.stringMatching(/\/uploads\/task-media\/d1\.txt$/),
  );
});

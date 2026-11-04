import { useRef, useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { $t } from '#i18n';
import { cn } from '#lib/utils';
import { Spinner } from '#components/ui/spinner';
import { Button } from '#components/ui/button';
import { FilePreviewDialog } from '#extensions/nocobase-file-component-ui/index';
import {
  TASK_IMAGE_ACCEPT,
  taskImageOf,
  type MessageImage,
} from '../../../shared/task-images.js';
import { taskImageSrc, type ComposerImage } from './task-images-model.js';

// How a started task's images show (2026-11-03 user request): in Activity's message box while they are added, under a
// sent message, and the hint and problems beside the box and the editor. What they do is in task-images-model.ts.

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};
/** The preview dialog's record of a message image. */
function previewRecord(image: MessageImage) {
  const ext = taskImageOf(image.ref)?.ext || '';
  return {
    id: image.id,
    disk: 'local',
    key: image.id,
    filename: image.name,
    ext,
    mimeType: MIME[ext] || 'image/png',
    size: 0,
    createdAt: '',
    updatedAt: '',
    contentUrl: taskImageSrc(image.ref),
  };
}

/** The number a message's image goes by, as the text calls it. */
const Badge = ({ n, small = false }: { n: number; small?: boolean }) => (
  <span
    className={cn(
      'pointer-events-none absolute top-1.5 left-1.5 rounded bg-zinc-900/75 px-1.5 leading-5 text-white',
      small ? 'top-1 left-1 px-1 text-[10px] leading-4' : 'text-xs',
    )}
  >
    {$t('taskImages.number', { 0: n })}
  </span>
);

/**
 * The images being added to a message, numbered in the order they were added: Image 1, Image 2. Removing one
 * renumbers the rest; the text says what each is for.
 */
export function ComposerImages({
  images,
  disabled,
  onRemove,
}: {
  images: ComposerImage[];
  disabled?: boolean;
  onRemove: (key: string) => void;
}) {
  if (!images.length) return null;
  return (
    <ul
      className='flex flex-wrap gap-3 pt-1.5'
      aria-label={$t('taskImages.images')}
    >
      {images.map((entry, i) => (
        <li key={entry.key} className='relative w-33'>
          <div className='h-21 overflow-hidden rounded-md border bg-muted'>
            <img
              src={entry.preview}
              alt={entry.name}
              className='size-full object-cover'
            />
            {!entry.image && (
              <span
                role='status'
                aria-label={$t('taskImages.uploading', { 0: entry.name })}
                className='absolute inset-0 flex items-center justify-center rounded-md bg-background/60'
              >
                <Spinner />
              </span>
            )}
          </div>
          <Badge n={i + 1} />
          <button
            type='button'
            disabled={disabled}
            aria-label={$t('taskImages.remove', { 0: i + 1 })}
            title={$t('taskImages.remove', { 0: i + 1 })}
            className='absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-zinc-700 text-white hover:bg-zinc-900 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50'
            onClick={() => onRemove(entry.key)}
          >
            <X className='size-3' aria-hidden='true' />
          </button>
          <p
            className='mt-1 truncate text-xs text-muted-foreground'
            title={entry.name}
          >
            {entry.name}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Add image: a link that opens the file picker for images. */
export function AddImageButton({
  disabled,
  onFiles,
}: {
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={pickerRef}
        type='file'
        multiple
        accept={TASK_IMAGE_ACCEPT}
        className='sr-only'
        tabIndex={-1}
        aria-hidden='true'
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <Button
        variant='link'
        size='sm'
        disabled={disabled}
        className='h-auto shrink-0 gap-1 p-0 font-normal'
        onClick={() => pickerRef.current?.click()}
      >
        <Plus aria-hidden='true' />
        {$t('taskImages.add')}
      </Button>
    </>
  );
}

/** A sent message's images under its text, numbered as when it was written; each opens large. */
export function MessageImages({ images }: { images: MessageImage[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!images.length) return null;
  return (
    <>
      <ul
        className='flex flex-wrap gap-2 pt-1'
        aria-label={$t('taskImages.images')}
      >
        {images.map((image, i) => (
          <li key={image.id} className='relative'>
            <button
              type='button'
              className='block h-14 w-22 overflow-hidden rounded-md border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
              aria-label={$t('taskImages.open', { 0: i + 1, 1: image.name })}
              title={image.name}
              onClick={() => setOpen(i)}
            >
              <img
                src={taskImageSrc(image.ref)}
                alt={image.name}
                loading='lazy'
                className='size-full object-cover'
              />
            </button>
            <Badge n={i + 1} small />
          </li>
        ))}
      </ul>
      <FilePreviewDialog
        open={open !== null}
        initialIndex={open ?? 0}
        onOpenChange={(value) => {
          if (!value) setOpen(null);
        }}
        labels={{ download: $t('manualTask.download') }}
        files={images.map(previewRecord)}
      />
    </>
  );
}

/** The paste-and-drop hint under the message box and the editor. */
export function ImageHint({ max }: { max?: number }) {
  return (
    <span className='min-w-0 text-xs text-muted-foreground'>
      {max ? $t('taskImages.hint', { 0: max }) : $t('taskImages.hintEditor')}
    </span>
  );
}

export function ImageProblem({ children }: { children?: ReactNode }) {
  return children ? (
    <p role='alert' className='nr-error text-sm'>
      {children}
    </p>
  ) : null;
}

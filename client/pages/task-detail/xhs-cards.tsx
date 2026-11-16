import { useState } from 'react';
import { copyText } from '@nocobase/app-client';
import { Copy, Download } from 'lucide-react';
import { $t } from '#i18n';
import { Button } from '#components/ui/button';
import { formatCount } from '#lib/format';
import { toast } from '#lib/toast';
import { cn } from '#lib/utils';
import { saveBlob, zipStored } from '#lib/zip';
import { FilePreviewDialog } from '#extensions/nocobase-file-component-ui/index';
import {
  XHS,
  cardChars,
  type CardSet,
  type Piece,
} from '../../../shared/repurpose.js';
import { taskImageOf } from '../../../shared/task-images.js';
import { previewRecord } from './task-images.js';
import { taskImageSrc } from './task-images-model.js';

// Xiaohongshu cards on the task page (Content workshop PR 2, mockup v2 frame 3 and v3 frame 4): the card images in a
// gallery, each saying which source sections it comes from; a card over the character limit, or one the Agent found
// overflowing, is framed in yellow. The done card downloads every image in one ZIP and copies the note's title and
// body. The images are the Agent's own renders, uploaded with its result.

/** The gallery of a set: its images in card order, each opening large. */
export function CardGallery({ cards, set }: { cards: Piece[]; set: CardSet }) {
  const [open, setOpen] = useState<number | null>(null);
  const overflow = new Set(set.overflow || []);
  const images = set.images.slice(0, cards.length);
  return (
    <>
      <ul
        className='grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-x-3 gap-y-4'
        aria-label={$t('workshop.cardsGallery')}
      >
        {images.map((image, i) => {
          const card = cards[i],
            n = i + 1,
            chars = cardChars(card),
            over = chars > XHS.cardChars,
            spilled = overflow.has(n);
          const label =
            n === 1
              ? $t('workshop.cardCover')
              : card.layout === 'end'
                ? $t('workshop.cardEnd')
                : card.sections
                  ? $t('workshop.fromSections', { 0: card.sections })
                  : '';
          return (
            <li
              key={image.id}
              className='flex min-w-0 flex-col gap-1.5'
              data-card={n}
              data-warn={over || spilled || undefined}
            >
              <button
                type='button'
                className={cn(
                  'block aspect-[3/4] w-full overflow-hidden rounded-md border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  (over || spilled) &&
                    'outline-2 outline-offset-2 outline-amber-500',
                )}
                aria-label={$t('workshop.openCard', {
                  0: n,
                  1: card.heading || card.text.split('\n')[0],
                })}
                onClick={() => setOpen(i)}
              >
                <img
                  src={taskImageSrc(image.ref)}
                  alt={[card.heading, card.text].filter(Boolean).join('\n')}
                  loading='lazy'
                  className='size-full object-cover'
                />
              </button>
              <div className='flex flex-col text-xs leading-5'>
                <span className='truncate text-muted-foreground'>
                  {label || ' '}
                </span>
                {over ? (
                  <span className='text-nr-ink-amber'>
                    {$t('workshop.cardCharsOver', {
                      0: formatCount(chars),
                      1: XHS.cardChars,
                    })}
                  </span>
                ) : null}
                {spilled ? (
                  <span className='text-nr-ink-amber'>
                    {$t('workshop.cardOverflow')}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
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

const copy = (value: string) =>
  void copyText(value).then((ok) =>
    ok
      ? toast.success(() => $t('workshop.copied'))
      : toast.error(() => $t('workshop.copyFailed')),
  );

/** The done card's tools: every image in one ZIP, and the note's title and body to paste. */
export function CardTools({
  set,
  title,
  body,
  name,
}: {
  set: CardSet;
  title?: string;
  body?: string;
  /** The ZIP's and the images' name: the task's number. */
  name: string;
}) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const files = [];
      for (const [i, image] of set.images.entries()) {
        const response = await fetch(taskImageSrc(image.ref), {
          credentials: 'same-origin',
        });
        if (!response.ok) throw new Error(String(response.status));
        const ext = taskImageOf(image.ref)?.ext || 'png';
        files.push({
          name: `${name}-${String(i + 1).padStart(2, '0')}.${ext}`,
          data: new Uint8Array(await response.arrayBuffer()),
        });
      }
      saveBlob(zipStored(files), `${name}.zip`);
    } catch {
      toast.error(() => $t('workshop.downloadFailed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className='flex flex-wrap gap-2'>
      <Button size='sm' disabled={busy} onClick={() => void download()}>
        <Download />
        {$t('workshop.downloadCards', { 0: set.images.length })}
      </Button>
      {title ? (
        <Button size='sm' variant='outline' onClick={() => copy(title)}>
          <Copy />
          {$t('workshop.copyTitle')}
        </Button>
      ) : null}
      {body ? (
        <Button size='sm' variant='outline' onClick={() => copy(body)}>
          <Copy />
          {$t('workshop.copyBody')}
        </Button>
      ) : null}
    </div>
  );
}

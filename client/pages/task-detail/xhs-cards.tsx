import { useDeferredValue, useMemo, useState } from 'react';
import { copyText, createUuid } from '@nocobase/app-client';
import { Copy, Download, Pencil } from 'lucide-react';
import { $t } from '#i18n';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Textarea } from '#components/ui/textarea';
import { renderCards } from '#lib/card-render';
import { formatCount, joinList } from '#lib/format';
import { toast } from '#lib/toast';
import { cn } from '#lib/utils';
import { saveBlob, zipStored } from '#lib/zip';
import { FilePreviewDialog } from '#extensions/nocobase-file-component-ui/index';
import {
  XHS,
  cardChars,
  charLength,
  parseRepurpose,
  writeXhs,
  type CardSet,
  type Piece,
} from '../../../shared/repurpose.js';
import {
  styleOf,
  type CardStyle,
  type TemplateCard,
} from '../../../shared/xhs-card.js';
import type { Artifact } from '../task-execution-types.js';
import { taskImageOf } from '../../../shared/task-images.js';
import { CardFrame } from '../workshop/card-frame.js';
import { previewFile } from './media-model.js';
import {
  mediaErrorText,
  taskImageSrc,
  useCardImageUpload,
} from './task-images-model.js';

// Xiaohongshu cards on the task page (Content workshop PR 2, mockup v2 frame 3 and v3 frame 4): the card images in a
// gallery, each saying which source sections it comes from; a card over the character limit, or one the Agent found
// overflowing, is framed in yellow. The done card downloads every image in one ZIP and copies the note's title and
// body. The images are the Agent's own renders, uploaded with its result, or a person's, drawn again in their browser
// from the same template when they edit the text (XhsCardEditor, 2026-11-17).

/** The gallery of a set: its images in card order, each opening large; on review, `onEdit` edits a card's text. */
export function CardGallery({
  cards,
  set,
  onEdit,
}: {
  cards: Piece[];
  set: CardSet;
  onEdit?: (n: number) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const overflow = new Set(set.overflow || []),
    edited = new Set(set.edited || []);
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
              <div className='group relative'>
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
                {onEdit ? (
                  <Button
                    type='button'
                    size='xs'
                    variant='secondary'
                    className='absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 shadow-sm group-focus-within:opacity-100 group-hover:opacity-100'
                    aria-label={$t('workshop.editCardText', { 0: n })}
                    onClick={() => onEdit(n)}
                  >
                    <Pencil />
                    {$t('workshop.editText')}
                  </Button>
                ) : null}
              </div>
              <div className='flex flex-col text-xs leading-5'>
                <span className='truncate text-muted-foreground'>
                  {label || ' '}
                </span>
                {edited.has(n) ? (
                  <span className='text-nr-ink-violet'>
                    {$t('workshop.cardEdited')}
                  </span>
                ) : null}
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
        files={images.map((image) =>
          previewFile({
            id: image.id,
            filename: image.name,
            size: 0,
            mimeType:
              taskImageOf(image.ref)?.ext === 'webp'
                ? 'image/webp'
                : 'image/png',
            contentUrl: taskImageSrc(image.ref),
          }),
        )}
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
function CardTools({
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
    <>
      <Button variant='outline' disabled={busy} onClick={() => void download()}>
        <Download />
        {$t('workshop.downloadCards', { 0: set.images.length })}
      </Button>
      {title ? (
        <Button variant='outline' onClick={() => copy(title)}>
          <Copy />
          {$t('workshop.copyTitle')}
        </Button>
      ) : null}
      {body ? (
        <Button variant='outline' onClick={() => copy(body)}>
          <Copy />
          {$t('workshop.copyBody')}
        </Button>
      ) : null}
    </>
  );
}

/** The done card's tools for an approved set of cards, or nothing for a result without images. */
export function XhsDoneTools({ out, name }: { out: Artifact; name: string }) {
  const set = out.cards?.images.length ? out.cards : null;
  if (!set) return null;
  const pieces = parseRepurpose('xhs', out.content)?.pieces || [];
  return (
    <CardTools
      set={set}
      title={pieces.find((p) => p.kind === 'title')?.text}
      body={pieces.find((p) => p.kind === 'body')?.text}
      name={name}
    />
  );
}

/** What Edit directly saves for a set of cards: its new text, and every card drawn again from it. */
export type CardEdit = {
  content: string;
  cards: { images: string[]; overflow: number[] };
};
/** The card being edited, from 1, or the note's title and body. */
export type CardSelection = number | 'note';

const templateCards = (pieces: Piece[]): TemplateCard[] =>
  pieces
    .filter((p) => p.kind === 'card')
    .map((p) => ({
      layout: p.layout || 'text',
      ...(p.heading ? { heading: p.heading } : {}),
      text: p.text,
    }));
const sameCard = (a: Piece, b?: Piece) =>
  Boolean(b) && (a.heading || '') === (b!.heading || '') && a.text === b!.text;

type Stage =
  | { step: 'drawing' }
  | { step: 'uploading'; done: number; total: number }
  | { step: 'saving' };

/**
 * Edit directly on a Xiaohongshu version (mockup xhs-edit-cards.html, option B confirmed 2026-11-17): the text of each
 * card and of the note, the card in hand drawn as it is typed by the template the set was drawn with. Saving draws every
 * card again in this browser, uploads the images and saves them with the text as a new version: no Agent runs and no
 * model is called. The layout, the number of cards and the style stay as they are; more than text goes to the Agent with
 * Request changes.
 */
export function XhsCardEditor({
  out,
  current,
  initial,
  onClose,
  onSave,
}: {
  out: Artifact;
  /** The brand kit's card style now: the logo, and the style of a set that does not record its own. */
  current: CardStyle;
  initial: CardSelection;
  onClose: () => void;
  onSave: (edit: CardEdit) => Promise<boolean>;
}) {
  const upload = useCardImageUpload();
  const [original] = useState(
    () => parseRepurpose('xhs', out.content)?.pieces || [],
  );
  const [pieces, setPieces] = useState(original);
  const [selected, setSelected] = useState<CardSelection>(initial);
  const [overflows, setOverflows] = useState(false);
  const [stage, setStage] = useState<Stage | null>(null);
  const brief = out.cards?.style;
  const style = useMemo(() => styleOf(brief, current), [brief, current]);
  const cards = pieces.filter((p) => p.kind === 'card'),
    before = original.filter((p) => p.kind === 'card');
  const preview = useDeferredValue(pieces);
  const shown = useMemo(() => templateCards(preview), [preview]);
  const changed = cards.flatMap((c, i) =>
    sameCard(c, before[i]) ? [] : [i + 1],
  );
  const noteOf = (list: Piece[], kind: 'title' | 'body') =>
    list.find((p) => p.kind === kind)?.text ?? '';
  const noteChanged =
    noteOf(pieces, 'title') !== noteOf(original, 'title') ||
    noteOf(pieces, 'body') !== noteOf(original, 'body');
  const empty = cards.some((c) => !c.text.trim() && !c.heading?.trim());
  const n = selected === 'note' ? 1 : selected;
  const card = selected === 'note' ? null : cards[selected - 1];
  const images = out.cards?.images || [];

  const setCard = (patch: Partial<Piece>) =>
    setPieces((list) => {
      let k = 0;
      return list.map((p) =>
        p.kind === 'card' && ++k === selected ? { ...p, ...patch } : p,
      );
    });
  const setNote = (kind: 'title' | 'body', text: string) =>
    setPieces((list) =>
      list.some((p) => p.kind === kind)
        ? list.map((p) => (p.kind === kind ? { ...p, text } : p))
        : [{ kind, text }, ...list],
    );

  const save = async () => {
    // What went wrong decides the words: the drawing in this browser, or the upload the server refused (a demo, a
    // quota), whose own words are shown.
    let failed: () => string = () => $t('workshop.drawFailed');
    try {
      setStage({ step: 'drawing' });
      const drawn = await renderCards(style, templateCards(pieces));
      const requestId = createUuid(),
        ids: string[] = [];
      failed = () => $t('workshop.uploadFailed');
      for (const [i, image] of drawn.images.entries()) {
        setStage({ step: 'uploading', done: i, total: drawn.images.length });
        try {
          ids.push(
            (
              await upload(
                image,
                `card-${String(i + 1).padStart(2, '0')}.png`,
                requestId,
              )
            ).id,
          );
        } catch (error) {
          const text = mediaErrorText(error);
          if (text) failed = () => text;
          throw error;
        }
      }
      setStage({ step: 'saving' });
      if (
        await onSave({
          content: writeXhs(pieces),
          cards: { images: ids, overflow: drawn.overflow },
        })
      )
        onClose();
    } catch {
      toast.error(failed);
    } finally {
      setStage(null);
    }
  };

  const label = (i: number) =>
    i === 1
      ? $t('workshop.cardCover')
      : cards[i - 1]?.layout === 'end'
        ? $t('workshop.cardEnd')
        : cards[i - 1]?.sections
          ? $t('workshop.fromSections', { 0: cards[i - 1].sections! })
          : '';
  const chars = card ? cardChars(card) : 0;
  const busy = stage !== null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className='gap-0 p-0 sm:max-w-[1040px]'>
        <DialogHeader className='border-b px-6 pt-5 pb-4'>
          <DialogTitle>{$t('workshop.editCards')}</DialogTitle>
        </DialogHeader>
        <div
          className='flex items-end gap-2 overflow-x-auto border-b px-6 py-3'
          role='tablist'
          aria-label={$t('workshop.editCards')}
        >
          <button
            type='button'
            role='tab'
            aria-selected={selected === 'note'}
            onClick={() => setSelected('note')}
            className={cn(
              'relative flex h-14 shrink-0 items-center rounded-md border px-3 text-xs',
              selected === 'note' &&
                'outline-2 outline-offset-2 outline-primary',
            )}
          >
            {$t('workshop.noteTitleAndBody')}
            {noteChanged ? <ChangedDot /> : null}
          </button>
          {cards
            .map((c, i) => ({
              n: i + 1,
              image: images[i],
              edited: !sameCard(c, before[i]),
            }))
            .map(({ n: k, image, edited }) => (
              <button
                key={k}
                type='button'
                role='tab'
                aria-selected={selected === k}
                aria-label={$t('workshop.pieceCard', { 0: k })}
                onClick={() => setSelected(k)}
                className={cn(
                  'relative h-14 w-[42px] shrink-0 overflow-hidden rounded-md border bg-muted',
                  selected === k &&
                    'outline-2 outline-offset-2 outline-primary',
                )}
              >
                {image ? (
                  <img
                    src={taskImageSrc(image.ref)}
                    alt=''
                    className='size-full object-cover'
                  />
                ) : (
                  <span className='text-xs'>{k}</span>
                )}
                {edited ? <ChangedDot /> : null}
              </button>
            ))}
        </div>
        <div className='grid gap-6 px-6 py-5 sm:grid-cols-[360px_minmax(0,1fr)]'>
          <CardFrame
            style={style}
            cards={shown}
            n={n}
            width={360}
            title={$t('workshop.pieceCard', { 0: n })}
            onOverflow={selected === 'note' ? undefined : setOverflows}
          />
          {card ? (
            <div className='min-w-0 space-y-4'>
              <p className='text-sm text-muted-foreground'>
                {[
                  $t('workshop.cardOf', { 0: n, 1: cards.length }),
                  label(n),
                  `${XHS.width}×${XHS.height}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <div className='space-y-1.5'>
                <div className='flex justify-between gap-3 text-sm'>
                  <Label htmlFor='xhs-card-heading'>
                    {$t('workshop.cardHeading')}
                  </Label>
                  <span className='text-xs text-muted-foreground'>
                    {$t('workshop.headingChars', {
                      0: formatCount(charLength(card.heading || '')),
                    })}
                  </span>
                </div>
                <Input
                  id='xhs-card-heading'
                  value={card.heading || ''}
                  disabled={busy}
                  onChange={(e) =>
                    setCard({ heading: e.target.value.replace(/\n/g, ' ') })
                  }
                />
              </div>
              <div className='space-y-1.5'>
                <div className='flex justify-between gap-3 text-sm'>
                  <Label htmlFor='xhs-card-text'>
                    {$t('workshop.cardText')}
                  </Label>
                  <span
                    className={cn(
                      'text-xs',
                      chars > XHS.cardChars
                        ? 'text-nr-ink-amber'
                        : 'text-muted-foreground',
                    )}
                  >
                    {$t('workshop.cardCharsCount', {
                      0: formatCount(chars),
                      1: XHS.cardChars,
                    })}
                  </span>
                </div>
                <Textarea
                  id='xhs-card-text'
                  rows={7}
                  value={card.text}
                  disabled={busy}
                  onChange={(e) => setCard({ text: e.target.value })}
                />
              </div>
              {overflows ? (
                <p className='text-sm text-nr-ink-amber' role='alert'>
                  {$t('workshop.cardDoesNotFit', { 0: n })}
                </p>
              ) : null}
              <ul className='list-disc space-y-1 pl-5 text-xs text-muted-foreground'>
                <li>{$t('workshop.editCardsOnlyText')}</li>
                <li>{$t('workshop.editCardsInBrowser')}</li>
                <li>{$t('workshop.editCardsMore')}</li>
              </ul>
            </div>
          ) : (
            <div className='min-w-0 space-y-4'>
              <NoteField
                id='xhs-note-title'
                label={$t('workshop.pieceNoteTitle')}
                value={noteOf(pieces, 'title')}
                max={XHS.noteTitle}
                disabled={busy}
                onChange={(v) => setNote('title', v.replace(/\n/g, ' '))}
              />
              <NoteField
                id='xhs-note-body'
                label={$t('workshop.pieceNoteBody')}
                value={noteOf(pieces, 'body')}
                max={XHS.noteBody}
                rows={12}
                disabled={busy}
                onChange={(v) => setNote('body', v)}
              />
            </div>
          )}
        </div>
        <DialogFooter className='mx-0 mb-0 items-center sm:justify-between'>
          <span className='text-sm text-muted-foreground'>
            {stage
              ? stage.step === 'drawing'
                ? $t('workshop.drawingCards')
                : stage.step === 'uploading'
                  ? $t('workshop.uploadingCards', {
                      0: stage.done + 1,
                      1: stage.total,
                    })
                  : $t('common.saving')
              : [
                  changed.length
                    ? $t('workshop.editedCards', {
                        0: joinList(
                          changed.map((c) =>
                            $t('workshop.pieceCard', { 0: c }),
                          ),
                        ),
                      })
                    : '',
                  noteChanged ? $t('workshop.editedNote') : '',
                ]
                  .filter(Boolean)
                  .join(' · ') || $t('workshop.noEdits')}
          </span>
          <div className='flex gap-2'>
            <Button
              type='button'
              variant='ghost'
              disabled={busy}
              onClick={onClose}
            >
              {$t('common.cancel')}
            </Button>
            <Button
              type='button'
              disabled={busy || empty || (!changed.length && !noteChanged)}
              onClick={() => void save()}
            >
              {$t('workshop.saveNewVersion')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ChangedDot = () => (
  <span
    aria-hidden='true'
    className='absolute top-1 right-1 size-2 rounded-full border border-white bg-nr-ink-violet'
  />
);

function NoteField({
  id,
  label,
  value,
  max,
  rows,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  max: number;
  rows?: number;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const length = charLength(value);
  return (
    <div className='space-y-1.5'>
      <div className='flex justify-between gap-3 text-sm'>
        <Label htmlFor={id}>{label}</Label>
        <span
          className={cn(
            'text-xs',
            length > max ? 'text-nr-ink-amber' : 'text-muted-foreground',
          )}
        >
          {formatCount(length)} / {formatCount(max)}
        </span>
      </div>
      {rows ? (
        <Textarea
          id={id}
          rows={rows}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

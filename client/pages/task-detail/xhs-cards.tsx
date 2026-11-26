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
import { imagesPdf, pdfPageOf } from '#lib/pdf';
import { FilePreviewDialog } from '#extensions/nocobase-file-component-ui/index';
import {
  CARD_SPECS,
  INSTAGRAM,
  LINKEDIN_DOC,
  XHS,
  cardLength,
  cardMax,
  cardUnit,
  charLength,
  hashtagsOf,
  parseRepurpose,
  writeCards,
  type CardSet,
  type CarouselForm,
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

// Carousel cards on the task page (Content workshop PR 2, mockup v2 frame 3 and v3 frame 4; Instagram and LinkedIn
// since 2026-11-24): the card images in a gallery, each saying which source sections it comes from; a card over the
// length limit, or one the Agent found overflowing, is framed in yellow. The done card downloads the set, every image in
// one ZIP numbered 01 to NN, or for LinkedIn one PDF of its pages, and copies the place's text: Xiaohongshu's note title
// and body, Instagram's caption and hashtags, LinkedIn's document title and post text. The images are the Agent's own
// renders, uploaded with its result, or a person's, drawn again in their browser from the same template when they edit
// the text (XhsCardEditor, 2026-11-17).

/** The gallery of a set: its images in card order, each opening large; on review, `onEdit` edits a card's text. */
export function CardGallery({
  form,
  cards,
  set,
  onEdit,
}: {
  form: CarouselForm;
  cards: Piece[];
  set: CardSet;
  onEdit?: (n: number) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const overflow = new Set(set.overflow || []),
    edited = new Set(set.edited || []);
  const images = set.images.slice(0, cards.length);
  const unit = cardUnit(cards),
    max = cardMax(unit);
  return (
    <>
      <ul
        className='grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-x-3 gap-y-4'
        aria-label={$t('workshop.cardsGallery')}
      >
        {images.map((image, i) => {
          const card = cards[i],
            n = i + 1,
            length = cardLength(card, unit),
            over = length > max,
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
                    'block w-full overflow-hidden rounded-md border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    set.ratio === '4:5' ? 'aspect-[4/5]' : 'aspect-[3/4]',
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
                {/* A LinkedIn document is read page by page: its page, then where the page comes from. */}
                {form === 'linkedin-carousel' ? (
                  <span className='font-medium'>
                    {$t('workshop.piecePage', { 0: n })}
                  </span>
                ) : null}
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
                    {$t(
                      unit === 'words'
                        ? 'workshop.cardWordsOver'
                        : 'workshop.cardCharsOver',
                      { 0: formatCount(length), 1: max },
                    )}
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

/** The images of a set, fetched in card order. */
async function fetchImages(set: CardSet) {
  const out = [];
  for (const image of set.images) {
    const response = await fetch(taskImageSrc(image.ref), {
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(String(response.status));
    out.push({
      ext: taskImageOf(image.ref)?.ext || 'png',
      blob: await response.blob(),
    });
  }
  return out;
}

/**
 * The done card's tools: the set downloaded, every image in one ZIP numbered 01 to NN, or LinkedIn's pages in one PDF;
 * and the place's two texts to paste.
 */
function CardTools({
  form,
  set,
  texts,
  name,
  pdfTitle,
}: {
  form: CarouselForm;
  set: CardSet;
  /** The texts copied, each with its button's words. */
  texts: { label: string; text?: string }[];
  /** The ZIP's and the images' name: the task's number. */
  name: string;
  /** The PDF's own title: the LinkedIn document title. */
  pdfTitle?: string;
}) {
  const [busy, setBusy] = useState(false);
  const pdf = form === 'linkedin-carousel';
  const download = async () => {
    setBusy(true);
    try {
      const images = await fetchImages(set);
      if (pdf) {
        const pages = [];
        for (const image of images) pages.push(await pdfPageOf(image.blob));
        saveBlob(
          new Blob([imagesPdf(pages, pdfTitle) as BlobPart], {
            type: 'application/pdf',
          }),
          `${name}.pdf`,
        );
      } else {
        const files = [];
        for (const [i, image] of images.entries())
          files.push({
            name: `${name}-${String(i + 1).padStart(2, '0')}.${image.ext}`,
            data: new Uint8Array(await image.blob.arrayBuffer()),
          });
        saveBlob(zipStored(files), `${name}.zip`);
      }
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
        {pdf
          ? $t('workshop.downloadPdf', { 0: set.images.length })
          : $t('workshop.downloadCards', { 0: set.images.length })}
      </Button>
      {texts.map(({ label, text }) =>
        text ? (
          <Button key={label} variant='outline' onClick={() => copy(text)}>
            <Copy />
            {label}
          </Button>
        ) : null,
      )}
    </>
  );
}

/** What the done card says to do with a set, under its title: Instagram's order, LinkedIn's Add a document. */
export function carouselDoneNote(form: CarouselForm, images: number) {
  return form === 'instagram'
    ? $t('workshop.instagramDoneNote', {
        0: String(images).padStart(2, '0'),
      })
    : form === 'linkedin-carousel'
      ? $t('workshop.linkedinDoneNote')
      : '';
}

/** The done card's tools for an approved set of cards, or nothing for a result without images. */
export function XhsDoneTools({
  form,
  out,
  name,
}: {
  form: CarouselForm;
  out: Artifact;
  name: string;
}) {
  const set = out.cards?.images.length ? out.cards : null;
  if (!set) return null;
  const pieces = parseRepurpose(form, out.content)?.pieces || [];
  const of = (kind: Piece['kind']) => pieces.find((p) => p.kind === kind)?.text;
  const texts =
    form === 'instagram'
      ? [
          { label: $t('workshop.copyCaption'), text: of('body') },
          {
            label: $t('workshop.copyHashtags'),
            text: hashtagsOf(of('tags') || '').join(' ') || undefined,
          },
        ]
      : form === 'linkedin-carousel'
        ? [
            { label: $t('workshop.copyDocTitle'), text: of('title') },
            { label: $t('workshop.copyPostText'), text: of('body') },
          ]
        : [
            { label: $t('workshop.copyTitle'), text: of('title') },
            { label: $t('workshop.copyBody'), text: of('body') },
          ];
  return (
    <CardTools
      form={form}
      set={set}
      texts={texts}
      name={name}
      pdfTitle={form === 'linkedin-carousel' ? of('title') : undefined}
    />
  );
}

/** What Edit directly saves for a set of cards: its new text, and every card drawn again from it. */
export type CardEdit = {
  content: string;
  cards: { images: string[]; overflow: number[] };
};
/** The card being edited, from 1, or the place's text: the note, the caption and hashtags, or the document's. */
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
 * Edit directly on a carousel version (mockup xhs-edit-cards.html, option B confirmed 2026-11-17; every place at its own
 * size since 2026-11-24): the text of each card and the place's own text, the card in hand drawn as it is typed by the
 * template the set was drawn with. Saving draws every card again in this browser at the place's size, uploads the images
 * and saves them with the text as a new version: no Agent runs and no model is called. The layout, the number of cards
 * and the style stay as they are; more than text goes to the Agent with Request changes.
 */
export function XhsCardEditor({
  form,
  out,
  current,
  initial,
  onClose,
  onSave,
}: {
  form: CarouselForm;
  out: Artifact;
  /** The brand kit's card style now: the logo, and the style of a set that does not record its own. */
  current: CardStyle;
  initial: CardSelection;
  onClose: () => void;
  onSave: (edit: CardEdit) => Promise<boolean>;
}) {
  const upload = useCardImageUpload();
  const [original] = useState(
    () => parseRepurpose(form, out.content)?.pieces || [],
  );
  const size = CARD_SPECS[form];
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
  const noteOf = (list: Piece[], kind: NoteKind) =>
    list.find((p) => p.kind === kind)?.text ?? '';
  const noteChanged = NOTE_KINDS[form].some(
    (kind) => noteOf(pieces, kind) !== noteOf(original, kind),
  );
  const unit = cardUnit(cards);
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
  const setNote = (kind: NoteKind, text: string) =>
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
      const drawn = await renderCards(style, templateCards(pieces), size);
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
          content: writeCards(pieces),
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
  const length = card ? cardLength(card, unit) : 0,
    max = cardMax(unit);
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
            {noteTabLabel(form)}
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
                  'relative h-14 shrink-0 overflow-hidden rounded-md border bg-muted',
                  size.height < XHS.height ? 'w-[45px]' : 'w-[42px]',
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
            size={size}
            title={$t('workshop.pieceCard', { 0: n })}
            onOverflow={selected === 'note' ? undefined : setOverflows}
          />
          {card ? (
            <div className='min-w-0 space-y-4'>
              <p className='text-sm text-muted-foreground'>
                {[
                  $t(
                    form === 'linkedin-carousel'
                      ? 'workshop.pageOf'
                      : 'workshop.cardOf',
                    { 0: n, 1: cards.length },
                  ),
                  label(n),
                  `${size.width}×${size.height}`,
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
                      length > max
                        ? 'text-nr-ink-amber'
                        : 'text-muted-foreground',
                    )}
                  >
                    {$t(
                      unit === 'words'
                        ? 'workshop.cardWordsCount'
                        : 'workshop.cardCharsCount',
                      { 0: formatCount(length), 1: max },
                    )}
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
              {noteFields(form).map((f) => (
                <NoteField
                  key={f.kind}
                  id={`card-note-${f.kind}`}
                  label={f.label}
                  value={noteOf(pieces, f.kind)}
                  max={f.max}
                  count={f.count}
                  fold={f.fold}
                  rows={f.rows}
                  disabled={busy}
                  onChange={(v) =>
                    setNote(f.kind, f.rows ? v : v.replace(/\n/g, ' '))
                  }
                />
              ))}
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

type NoteKind = 'title' | 'body' | 'tags';
/** The place's own text beside its cards, in the order it is edited. */
const NOTE_KINDS: Record<CarouselForm, NoteKind[]> = {
  xhs: ['title', 'body'],
  instagram: ['body', 'tags'],
  'linkedin-carousel': ['title', 'body'],
};
const noteTabLabel = (form: CarouselForm) =>
  form === 'instagram'
    ? $t('workshop.captionAndHashtags')
    : form === 'linkedin-carousel'
      ? $t('workshop.docTitleAndPost')
      : $t('workshop.noteTitleAndBody');
/** Each text's field: its name, its limit and how it is counted. */
function noteFields(form: CarouselForm): {
  kind: NoteKind;
  label: string;
  max: number;
  count?: (value: string) => number;
  fold?: number;
  rows?: number;
}[] {
  if (form === 'instagram')
    return [
      {
        kind: 'body',
        label: $t('workshop.pieceCaption'),
        max: INSTAGRAM.caption,
        fold: INSTAGRAM.captionFold,
        rows: 10,
      },
      {
        kind: 'tags',
        label: $t('workshop.pieceHashtags'),
        max: INSTAGRAM.hashtags,
        count: (v) => hashtagsOf(v).length,
        rows: 2,
      },
    ];
  if (form === 'linkedin-carousel')
    return [
      {
        kind: 'title',
        label: $t('workshop.pieceDocTitle'),
        max: LINKEDIN_DOC.title,
      },
      {
        kind: 'body',
        label: $t('workshop.piecePostText'),
        max: LINKEDIN_DOC.post,
        rows: 12,
      },
    ];
  return [
    { kind: 'title', label: $t('workshop.pieceNoteTitle'), max: XHS.noteTitle },
    {
      kind: 'body',
      label: $t('workshop.pieceNoteBody'),
      max: XHS.noteBody,
      rows: 12,
    },
  ];
}

function NoteField({
  id,
  label,
  value,
  max,
  count = charLength,
  fold,
  rows,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  max: number;
  /** How the text is counted: characters, or a hashtag block's hashtags. */
  count?: (value: string) => number;
  /** An Instagram caption's opening shown before "more", counted on its own. */
  fold?: number;
  rows?: number;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const length = count(value);
  const opening = fold ? charLength(value.trim().split('\n')[0] || '') : 0;
  return (
    <div className='space-y-1.5'>
      <div className='flex justify-between gap-3 text-sm'>
        <Label htmlFor={id}>{label}</Label>
        <span className='flex gap-3 text-xs'>
          {fold ? (
            <span
              className={cn(
                opening > fold ? 'text-nr-ink-amber' : 'text-muted-foreground',
              )}
            >
              {$t('workshop.captionOpening', {
                0: formatCount(opening),
                1: formatCount(fold),
              })}
            </span>
          ) : null}
          <span
            className={cn(
              length > max ? 'text-nr-ink-amber' : 'text-muted-foreground',
            )}
          >
            {formatCount(length)} / {formatCount(max)}
          </span>
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

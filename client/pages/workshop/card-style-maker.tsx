import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import {
  CheckIcon,
  ImageIcon,
  SparklesIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import { $t } from '#i18n';
import { Segmented } from '#components/reach/segmented';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Spinner } from '#components/ui/spinner';
import { Textarea } from '#components/ui/textarea';
import { cn } from '#lib/utils';
import { pixelColors, setColors } from '../../../shared/card-colors.js';
import {
  DESIGN_CHANGE_MAX,
  DESIGN_IMAGE_BYTES,
  DESIGN_IMAGE_TYPES,
  DESIGN_NAME_MAX,
  DESIGN_PROMPT_MAX,
  designFonts,
  type CardDesign,
  type DesignFont,
  type SavedStyle,
} from '../../../shared/card-design.js';
import { CARD, cardChars } from '../../../shared/repurpose.js';
import {
  cardStyle,
  type CardStyle,
  type TemplateCard,
} from '../../../shared/xhs-card.js';
import { CardFrame } from './card-frame.js';
import {
  drawCheck,
  fitChecks,
  type FitResult,
  type Ratio,
} from './style-fit.js';
import {
  brandCardsOf,
  errorText,
  workshopRequest,
  type CardFields,
} from './model.js';

// Card style › New style (2026-11-17 user decision; mockup xhs-card-styles.html frame 3): the person describes the look
// in a sentence, with a card they like if they want; the model on Editing and suggestions writes a whole style
// (card-styles.ts), which is drawn here with the cards' real text in sandboxed frames and checked: every card's text fits
// at 3:4 and at 4:5 (2026-11-24; style-fit.ts), with the full cards a card may hold among them, in at most three colors
// and the fonts NocoReach allows. They can ask for changes or a new one, and save it to My styles when it fits. Adjust
// with AI opens it on one of My styles that does not fit at 4:5, and saves the change as a new style.

type Draft = { name: string; summary: string; design: CardDesign };
type ModelInfo = { configured: boolean; images: boolean };
type Checked =
  | { state: 'measuring' }
  | { state: 'failed' }
  | { state: 'done'; sizes: FitResult[]; colors: string[] };

const IMAGE_SIDE = 1024;
const IMAGE_FILE_MAX = 20 * 1024 * 1024;

/** A reference image made small enough to send: at most 1024 px on its longer side, as WebP (JPEG where unsupported). */
async function referenceOf(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = canvas.toDataURL('image/webp', 0.86);
  return webp.startsWith('data:image/webp')
    ? webp
    : canvas.toDataURL('image/jpeg', 0.86);
}

/** The colors of a drawn card, counted from its pixels as the server counts an uploaded card's. */
async function colorsOf(image: Blob): Promise<string[]> {
  const bitmap = await createImageBitmap(image);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return [];
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return pixelColors(
    context.getImageData(0, 0, canvas.width, canvas.height).data,
  );
}

/** The model's name for a style, numbered (" 2", " 3") when My styles already has one so called. */
function freeName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name;
  for (let n = 2; n < 100; n++) {
    const suffix = ` ${n}`;
    const next = name.slice(0, DESIGN_NAME_MAX - suffix.length) + suffix;
    if (!taken.includes(next)) return next;
  }
  return name;
}

const FONT_NAMES: Record<DesignFont, () => string> = {
  sans: () => $t('workshop.fontSans'),
  serif: () => $t('workshop.fontSerif'),
  mono: () => $t('workshop.fontMono'),
};

export function CardStyleMaker({
  projectId,
  fields,
  cards,
  siteIcon,
  project,
  taken,
  start,
  onClose,
  onSaved,
}: {
  projectId: string;
  fields: CardFields;
  /** The cards the styles are previewed with (brand-cards.tsx previewCards). */
  cards: TemplateCard[];
  siteIcon: string | null;
  project: { name?: string; site?: string };
  /** My styles' names, which a new one may not take. */
  taken: string[];
  /** One of My styles to adjust (Adjust with AI): shown as the draft, and saved as a new style. */
  start?: SavedStyle;
  onClose: () => void;
  onSaved: (style: SavedStyle) => void;
}) {
  const [look, setLook] = useState('');
  const [image, setImage] = useState<{ url: string; name: string } | null>(
    null,
  );
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [draft, setDraft] = useState<Draft | null>(() =>
    start
      ? { name: start.name, summary: start.summary, design: start.design }
      : null,
  );
  const [made, setMade] = useState(0);
  const [change, setChange] = useState('');
  // The size the cards are previewed at; both are checked.
  const [ratio, setRatio] = useState<Ratio>('3:4');
  const [name, setName] = useState(() =>
    start ? freeName(start.name, taken) : '',
  );
  const [busy, setBusy] = useState<'draft' | 'change' | 'save' | null>(null);
  const [failure, setFailure] = useState('');
  // The checks of the style they were made on; a style not checked yet is being measured.
  const [result, setResult] = useState<{
    style: CardStyle;
    checked: Checked;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    workshopRequest<ModelInfo>('styleModel', projectId, {}, controller.signal)
      .then(setModel)
      .catch(() => {
        if (!controller.signal.aborted)
          setModel({ configured: true, images: false });
      });
    return () => {
      controller.abort();
      abortRef.current?.abort();
    };
  }, [projectId]);

  // The cards checked at each size: the latest set's (or the sample's) and the full cards; four are shown.
  const checks = useMemo(() => fitChecks(cards), [cards]);
  const shown = useMemo(() => {
    const texts = cards
      .map((c, i) => ({ c, n: i + 1 }))
      .filter(({ c }) => c.layout === 'text')
      .sort((a, b) => cardChars(b.c) - cardChars(a.c));
    return [
      cards.findIndex((c) => c.layout === 'cover') + 1,
      texts[0]?.n ?? 0,
      texts.at(-1)?.n ?? 0,
      cards.findIndex((c) => c.layout === 'end') + 1,
    ].filter((n, i, all) => n > 0 && all.indexOf(n) === i);
  }, [cards]);
  const style: CardStyle | null = useMemo(
    () =>
      draft
        ? {
            ...cardStyle(brandCardsOf({ ...fields, skill: null }), {
              ...project,
              icon: siteIcon,
            }),
            template: 'custom',
            name: draft.name,
            design: draft.design,
          }
        : null,
    [draft, fields, project, siteIcon],
  );
  const checked: Checked | null = !style
    ? null
    : result?.style === style
      ? result.checked
      : { state: 'measuring' };

  // Every check card drawn as the Agent would draw it, at both sizes; the colors are counted on the 3:4 cards shown and
  // the full one.
  useEffect(() => {
    if (!style) return;
    let live = true;
    Promise.all(checks.map((check) => drawCheck(style, check)))
      .then(async (drawn) => {
        const first = drawn[0];
        const counted = await Promise.all(
          [...shown.map((n) => n - 1), checks[0].fullChars - 1].map((i) =>
            colorsOf(first.images[i]),
          ),
        );
        if (live)
          setResult({
            style,
            checked: {
              state: 'done',
              sizes: drawn.map(({ ratio, overflow }) => ({ ratio, overflow })),
              colors: setColors(counted),
            },
          });
      })
      .catch(() => {
        if (live) setResult({ style, checked: { state: 'failed' } });
      });
    return () => {
      live = false;
    };
  }, [style, checks, shown]);

  const ask = async (kind: 'draft' | 'change') => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(kind);
    setFailure('');
    try {
      const next = await workshopRequest<Draft>(
        'draftStyle',
        projectId,
        {
          look: look.trim(),
          ...(image && model?.images ? { image: image.url } : {}),
          ...(kind === 'change' && draft
            ? { previous: draft.design, change: change.trim() }
            : {}),
          color: fields.color,
          cards: cards.slice(0, 8),
        },
        controller.signal,
      );
      setDraft(next);
      setMade((n) => n + 1);
      if (kind === 'change') setChange('');
      // A name the person typed stays; the suggested one follows the new draft, numbered when My styles has it.
      setName((was) =>
        was && draft && was !== freeName(draft.name, taken)
          ? was
          : freeName(next.name, taken),
      );
    } catch (e) {
      if (!controller.signal.aborted)
        setFailure(errorText(e, $t('workshop.styleFailed')));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(null);
      }
    }
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (
      !(DESIGN_IMAGE_TYPES as readonly string[]).includes(file.type) ||
      file.size > IMAGE_FILE_MAX
    ) {
      setFailure(
        $t('workshop.styleImageInvalid', {
          0: Math.round(DESIGN_IMAGE_BYTES / 1024 / 1024),
        }),
      );
      return;
    }
    try {
      const url = await referenceOf(file);
      if (url.length * 0.75 > DESIGN_IMAGE_BYTES) throw new Error('too large');
      setFailure('');
      setImage({ url, name: file.name });
    } catch {
      setFailure(
        $t('workshop.styleImageInvalid', {
          0: Math.round(DESIGN_IMAGE_BYTES / 1024 / 1024),
        }),
      );
    }
  };

  const fits =
    checked?.state === 'done' &&
    checked.sizes.every((size) => size.overflow.length === 0);
  const trimmed = name.trim();
  const nameProblem = !trimmed
    ? ''
    : taken.includes(trimmed)
      ? $t('workshop.styleNameTaken')
      : '';
  const save = async () => {
    if (!draft) return;
    setBusy('save');
    setFailure('');
    try {
      onSaved(
        await workshopRequest<SavedStyle>('saveStyle', projectId, {
          name: trimmed,
          summary: draft.summary,
          design: draft.design,
        }),
      );
    } catch (e) {
      setFailure(errorText(e, $t('common.saveFailed')));
      setBusy(null);
    }
  };

  const canAsk = Boolean(look.trim() || (image && model?.images));
  const fonts = draft ? designFonts(draft.design) : [];
  const usesLogo = draft
    ? [draft.design.cover, draft.design.text, draft.design.end].some((m) =>
        m.includes('data-slot="logo"'),
      )
    : false;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && busy !== 'save') onClose();
      }}
    >
      <DialogContent className='max-h-[94vh] overflow-y-auto sm:max-w-[1040px]'>
        <DialogHeader>
          <DialogTitle>
            {start
              ? $t('workshop.adjustStyleTitle', { 0: start.name })
              : $t('workshop.newStyleTitle')}
          </DialogTitle>
          <DialogDescription>
            {start
              ? $t('workshop.adjustStyleDescription')
              : $t('workshop.newStyleDescription')}
          </DialogDescription>
        </DialogHeader>
        {model && !model.configured ? <NoModel /> : null}
        <div className='grid gap-6 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]'>
          <div className='space-y-4'>
            <div className='space-y-1.5'>
              <Label htmlFor='style-look'>{$t('workshop.styleLook')}</Label>
              <Textarea
                id='style-look'
                rows={4}
                maxLength={DESIGN_PROMPT_MAX}
                placeholder={$t('workshop.styleLookPlaceholder')}
                value={look}
                disabled={busy !== null}
                onChange={(e) => setLook(e.target.value)}
              />
            </div>
            <div className='space-y-1.5'>
              <p className='text-sm font-medium'>
                {$t('workshop.styleImage')}{' '}
                <span className='font-normal text-muted-foreground'>
                  {$t('workshop.styleImageOptional')}
                </span>
              </p>
              <div className='flex gap-3 rounded-lg border border-dashed p-3'>
                {image ? (
                  <img
                    src={image.url}
                    alt=''
                    className='h-24 w-18 shrink-0 rounded-md border object-cover'
                  />
                ) : (
                  <span className='grid h-24 w-18 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground'>
                    <ImageIcon className='size-5' aria-hidden='true' />
                  </span>
                )}
                <div className='min-w-0 space-y-1.5 text-sm'>
                  {image ? (
                    <p className='truncate text-muted-foreground'>
                      {image.name}
                    </p>
                  ) : null}
                  <p className='text-muted-foreground'>
                    {model && model.configured && !model.images
                      ? $t('workshop.styleImageUnreadable')
                      : $t('workshop.styleImageHint')}
                  </p>
                  <p className='flex gap-3'>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      disabled={busy !== null || !model?.images}
                      onClick={() => fileRef.current?.click()}
                    >
                      {image
                        ? $t('workshop.styleImageChange')
                        : $t('workshop.styleImageUpload')}
                    </Button>
                    {image ? (
                      <Button
                        type='button'
                        size='sm'
                        variant='ghost'
                        disabled={busy !== null}
                        onClick={() => setImage(null)}
                      >
                        {$t('workshop.logoRemove')}
                      </Button>
                    ) : null}
                  </p>
                  <input
                    ref={fileRef}
                    type='file'
                    hidden
                    accept={DESIGN_IMAGE_TYPES.join(',')}
                    onChange={(e) => {
                      void pick(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
            </div>
            <div className='space-y-1.5'>
              <Button
                type='button'
                variant={draft ? 'outline' : 'default'}
                disabled={
                  busy !== null || !canAsk || model?.configured === false
                }
                onClick={() => void ask('draft')}
              >
                {busy === 'draft' ? <Spinner /> : <SparklesIcon />}
                {busy === 'draft'
                  ? $t('workshop.styleMaking')
                  : draft
                    ? $t('workshop.styleRemake')
                    : $t('workshop.styleMake')}
              </Button>
              <p className='text-xs text-muted-foreground'>
                {made
                  ? $t('workshop.styleMadeTimes', { 0: made })
                  : $t('workshop.styleMakeHint')}
              </p>
            </div>
          </div>

          <div className='min-w-0 space-y-3'>
            {style ? (
              <>
                <Segmented
                  size='sm'
                  label={$t('workshop.previewSize')}
                  options={checks.map((c) => ({ id: c.ratio, label: c.ratio }))}
                  value={ratio}
                  onChange={(id) => setRatio(id as Ratio)}
                />
                <ul className='flex flex-wrap gap-2' aria-label={draft?.name}>
                  {shown.map((n) => (
                    <li key={n}>
                      <CardFrame
                        style={style}
                        cards={cards}
                        n={n}
                        width={148}
                        size={checks.find((c) => c.ratio === ratio)!.size}
                        title={cards[n - 1].heading || cards[n - 1].text}
                      />
                    </li>
                  ))}
                </ul>
                {draft?.summary ? (
                  <p className='text-sm text-muted-foreground'>
                    {draft.summary}
                  </p>
                ) : null}
                <ul className='flex flex-wrap gap-x-4 gap-y-1 text-sm'>
                  {checked?.state === 'measuring' ? (
                    <li className='flex items-center gap-1.5 text-muted-foreground'>
                      <Spinner className='size-3.5' />
                      {$t('workshop.styleChecking')}
                    </li>
                  ) : checked?.state === 'failed' ? (
                    <Check ok={false}>{$t('workshop.styleCheckFailed')}</Check>
                  ) : checked?.state === 'done' ? (
                    <>
                      {checked.sizes.map((size, i) => (
                        <SizeCheck
                          key={size.ratio}
                          result={size}
                          check={checks[i]}
                        />
                      ))}
                      <Check ok={checked.colors.length <= CARD.colors} warn>
                        {checked.colors.length <= CARD.colors
                          ? $t('workshop.styleColors', {
                              0: checked.colors.length,
                              1: CARD.colors,
                            })
                          : $t('workshop.styleColorsOver', {
                              0: checked.colors.length,
                              1: CARD.colors,
                            })}
                      </Check>
                      <Check ok={usesLogo} warn>
                        {usesLogo
                          ? $t('workshop.styleLogo')
                          : $t('workshop.styleNoLogo')}
                      </Check>
                      <Check ok>
                        {$t('workshop.styleFonts', {
                          0: fonts
                            .map((f) => FONT_NAMES[f]())
                            .join($t('workshop.listSeparator')),
                        })}
                      </Check>
                    </>
                  ) : null}
                </ul>
                <form
                  className='space-y-1.5'
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (change.trim()) void ask('change');
                  }}
                >
                  <Label htmlFor='style-change'>
                    {$t('workshop.styleChange')}
                  </Label>
                  <div className='flex gap-2'>
                    <Input
                      id='style-change'
                      maxLength={DESIGN_CHANGE_MAX}
                      placeholder={$t('workshop.styleChangePlaceholder')}
                      value={change}
                      disabled={busy !== null}
                      onChange={(e) => setChange(e.target.value)}
                    />
                    <Button
                      type='submit'
                      variant='outline'
                      disabled={busy !== null || !change.trim()}
                    >
                      {busy === 'change' ? <Spinner /> : null}
                      {$t('workshop.styleApplyChange')}
                    </Button>
                  </div>
                </form>
              </>
            ) : (
              <div className='grid min-h-72 place-items-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
                {busy === 'draft' ? (
                  <span className='flex items-center gap-2'>
                    <Spinner />
                    {$t('workshop.styleMakingLong')}
                  </span>
                ) : (
                  $t('workshop.stylePreviewEmpty')
                )}
              </div>
            )}
          </div>
        </div>
        {failure ? (
          <p className='text-sm text-destructive' role='alert'>
            {failure}
          </p>
        ) : null}
        <DialogFooter className='items-center sm:justify-between'>
          <div className='flex items-center gap-2'>
            <Label htmlFor='style-name' className='shrink-0'>
              {$t('workshop.styleName')}
            </Label>
            <Input
              id='style-name'
              className='w-48'
              maxLength={DESIGN_NAME_MAX}
              value={name}
              disabled={!draft || busy !== null}
              aria-invalid={Boolean(nameProblem)}
              onChange={(e) => setName(e.target.value)}
            />
            {nameProblem ? (
              <span className='text-sm text-destructive'>{nameProblem}</span>
            ) : null}
          </div>
          <div className='flex gap-2'>
            <Button
              type='button'
              variant='ghost'
              disabled={busy === 'save'}
              onClick={onClose}
            >
              {$t('common.cancel')}
            </Button>
            <Button
              type='button'
              disabled={
                !draft ||
                !fits ||
                !trimmed ||
                Boolean(nameProblem) ||
                busy !== null
              }
              title={
                draft && !fits ? $t('workshop.styleSaveNeedsFit') : undefined
              }
              onClick={() => void save()}
            >
              {$t('workshop.styleSave')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Check({
  ok,
  warn,
  children,
}: {
  ok: boolean;
  /** A failed check that does not keep the style from being saved. */
  warn?: boolean;
  children: React.ReactNode;
}) {
  const Icon = ok ? CheckIcon : warn ? TriangleAlertIcon : XIcon;
  return (
    <li
      className={cn(
        'flex items-center gap-1.5',
        ok
          ? 'text-nr-ink-green'
          : warn
            ? 'text-nr-ink-amber'
            : 'text-destructive',
      )}
    >
      <Icon className='size-3.5 shrink-0' aria-hidden='true' />
      {children}
    </li>
  );
}

/** Whether every card's text fits at one size: "All 9 cards fit at 4:5 (including …)", or the cards that do not. */
function SizeCheck({
  result,
  check,
}: {
  result: FitResult;
  check: ReturnType<typeof fitChecks>[number];
}) {
  const label = (n: number) =>
    n === check.fullChars
      ? $t('workshop.styleFullestCard', { 0: CARD.cardChars })
      : n === check.fullWords
        ? $t('workshop.styleFullEnglishCard', { 0: CARD.cardWords })
        : $t('workshop.pieceCard', { 0: n });
  const ok = result.overflow.length === 0;
  return (
    <Check ok={ok}>
      {ok
        ? check.fullWords
          ? $t('workshop.styleFitsBoth', {
              0: result.ratio,
              1: check.cards.length,
              2: CARD.cardChars,
              3: CARD.cardWords,
            })
          : $t('workshop.styleFitsAt', {
              0: result.ratio,
              1: check.cards.length,
              2: CARD.cardChars,
            })
        : $t('workshop.styleOverflowAt', {
            0: result.ratio,
            1: result.overflow.map(label).join($t('workshop.listSeparator')),
          })}
    </Check>
  );
}

/** No model is set up: where an administrator sets one up, linked for those who may. */
function NoModel() {
  const read = useCan({
    resource: { type: 'settings', id: 'agents.services' },
    action: 'read',
  });
  const manage = useCan({
    resource: { type: 'settings', id: 'agents.services' },
    action: 'manage',
  });
  const path = $t('manualTask.modelSettingsPath');
  return (
    <p
      className='rounded-lg bg-nr-tint-amber p-3 text-sm text-nr-ink-amber'
      role='status'
    >
      {$t('workshop.styleNoModel')}{' '}
      {read.can && manage.can ? (
        <Link to='/agents/models' className='nr-link'>
          {path}
        </Link>
      ) : (
        <span className='font-medium'>{path}</span>
      )}
    </p>
  );
}

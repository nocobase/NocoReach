import { useDeferredValue, useRef, useState } from 'react';
import { $t } from '#i18n';
import { Tag } from '#components/reach/tag';
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
import { cn } from '#lib/utils';
import {
  CARD_TEMPLATES,
  ENDING_HEADING_MAX,
  ENDING_TEXT_MAX,
  LOGO_BYTES,
  LOGO_TYPES,
  cardStyle,
  type CardTemplateId,
  type TemplateCard,
} from '../../../shared/xhs-card.js';
import { CardFrame } from './card-frame.js';
import { brandCardsOf, type CardFields, type WorkshopView } from './model.js';

// Brand and templates' card settings (Content workshop PR 2; card styles 2026-11-17, mockup xhs-card-styles.html
// frames 1 and 2): the card style Xiaohongshu cards are drawn in, chosen from the built-in styles, each previewed with
// the latest set's own cards; and the brand basics every style draws with: the logo, the brand color and the closing
// page. The previews are drawn by the template the Agent renders with (shared/xhs-card.ts).

const styleName = (id: CardTemplateId) =>
  ({
    editorial: $t('workshop.styleEditorial'),
    memo: $t('workshop.styleMemo'),
    dark: $t('workshop.styleDark'),
    checklist: $t('workshop.styleChecklist'),
  })[id];
const styleFit = (id: CardTemplateId) =>
  ({
    editorial: $t('workshop.styleEditorialFit'),
    memo: $t('workshop.styleMemoFit'),
    dark: $t('workshop.styleDarkFit'),
    checklist: $t('workshop.styleChecklistFit'),
  })[id];

type Sample = WorkshopView['cardSample'];
type Project = { name?: string; site?: string };

/**
 * The cards a style is previewed with: the latest Xiaohongshu set's, else sample text; the closing page is the one the
 * brand kit now has, or none.
 */
function previewCards(sample: Sample, fields: CardFields): TemplateCard[] {
  const body: TemplateCard[] = sample?.cards.length
    ? sample.cards.filter((c) => c.layout !== 'end')
    : [
        {
          layout: 'cover',
          heading: $t('workshop.sampleCoverHeading'),
          text: $t('workshop.sampleCoverText'),
        },
        ...[
          $t('workshop.sampleCardHeading'),
          $t('workshop.sampleCard2Heading'),
          $t('workshop.sampleCard3Heading'),
        ].map((heading) => ({
          layout: 'text' as const,
          heading,
          text: $t('workshop.sampleCardText'),
        })),
      ];
  const heading = fields.endingHeading.trim();
  return heading
    ? [...body, { layout: 'end', heading, text: fields.endingText.trim() }]
    : body;
}

/** A style's cover, first card of text and closing page, side by side. */
function StyleTrio({
  fields,
  template,
  cards,
  siteIcon,
  project,
  width,
}: {
  fields: CardFields;
  template: CardTemplateId;
  cards: TemplateCard[];
  siteIcon: string | null;
  project: Project;
  width: number;
}) {
  const style = cardStyle(
    { ...brandCardsOf(fields), template },
    { ...project, icon: siteIcon },
  );
  const shown = [
    1,
    cards.findIndex((c) => c.layout === 'text') + 1,
    cards.findIndex((c) => c.layout === 'end') + 1,
  ].filter((n, i, all) => n > 0 && all.indexOf(n) === i);
  return (
    <ul className='flex gap-2' aria-label={styleName(template)}>
      {shown.map((n) => (
        <li key={n}>
          <CardFrame
            style={style}
            cards={cards}
            n={n}
            width={width}
            title={cards[n - 1].heading || cards[n - 1].text}
          />
        </li>
      ))}
    </ul>
  );
}

/** Card style: the style in use, previewed, and the picker that changes it. */
export function CardStyleSection({
  fields,
  onChange,
  sample,
  siteIcon,
  project,
  disabled,
}: {
  fields: CardFields;
  onChange: (fields: CardFields) => void;
  sample: Sample;
  siteIcon: string | null;
  project: Project;
  disabled?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const shown = useDeferredValue(fields);
  const cards = previewCards(sample, shown);
  return (
    <section className='space-y-3' aria-labelledby='brand-card-style'>
      <div className='flex items-center justify-between gap-3'>
        <h3 id='brand-card-style' className='text-sm font-semibold'>
          {$t('workshop.cardStyle')}
        </h3>
        <Button
          type='button'
          size='sm'
          variant='outline'
          disabled={disabled}
          onClick={() => setPicking(true)}
        >
          {$t('workshop.changeStyle')}
        </Button>
      </div>
      <p className='text-sm text-muted-foreground'>
        {$t('workshop.cardStyleHint')}
      </p>
      <div className='flex flex-wrap items-start gap-4 rounded-lg border p-3'>
        <StyleTrio
          fields={shown}
          template={shown.template}
          cards={cards}
          siteIcon={siteIcon}
          project={project}
          width={96}
        />
        <div className='min-w-48 flex-1 space-y-1'>
          <p className='flex items-center gap-2 text-sm font-medium'>
            {styleName(fields.template)}
            <Tag tone='grey'>{$t('workshop.builtIn')}</Tag>
          </p>
          <p className='text-sm text-muted-foreground'>
            {styleFit(fields.template)}
          </p>
        </div>
      </div>
      {picking ? (
        <StylePicker
          fields={shown}
          cards={cards}
          sample={sample}
          siteIcon={siteIcon}
          project={project}
          onClose={() => setPicking(false)}
          onPick={(template) => {
            onChange({ ...fields, template });
            setPicking(false);
          }}
        />
      ) : null}
    </section>
  );
}

/** Change style: the built-in styles, each previewed with the same cards, the one in use marked. */
function StylePicker({
  fields,
  cards,
  sample,
  siteIcon,
  project,
  onClose,
  onPick,
}: {
  fields: CardFields;
  cards: TemplateCard[];
  sample: Sample;
  siteIcon: string | null;
  project: Project;
  onClose: () => void;
  onPick: (template: CardTemplateId) => void;
}) {
  const [chosen, setChosen] = useState(fields.template);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className='sm:max-w-[1040px]'>
        <DialogHeader>
          <DialogTitle>{$t('workshop.cardStyle')}</DialogTitle>
          <DialogDescription>
            {sample
              ? $t('workshop.stylePreviewSample', { 0: sample.subject })
              : $t('workshop.stylePreviewText')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-2'>
          <h4 className='text-sm font-semibold'>
            {$t('workshop.builtInStyles')}
          </h4>
          <div
            role='radiogroup'
            aria-label={$t('workshop.builtInStyles')}
            className='grid gap-3 sm:grid-cols-2'
          >
            {CARD_TEMPLATES.map((id) => (
              <button
                key={id}
                type='button'
                role='radio'
                aria-checked={chosen === id}
                onClick={() => setChosen(id)}
                className={cn(
                  'flex flex-col gap-2.5 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  chosen === id && 'border-primary ring-1 ring-primary',
                )}
              >
                <StyleTrio
                  fields={fields}
                  template={id}
                  cards={cards}
                  siteIcon={siteIcon}
                  project={project}
                  width={112}
                />
                <span className='flex items-center gap-2 text-sm font-medium'>
                  {styleName(id)}
                  {fields.template === id ? (
                    <Tag tone='blue'>{$t('workshop.styleInUse')}</Tag>
                  ) : null}
                </span>
                <span className='text-sm text-muted-foreground'>
                  {styleFit(id)}
                </span>
              </button>
            ))}
          </div>
        </div>
        <p className='text-xs text-muted-foreground'>
          {$t('workshop.styleNewTasksOnly')}
        </p>
        <DialogFooter>
          <Button type='button' variant='ghost' onClick={onClose}>
            {$t('common.cancel')}
          </Button>
          <Button type='button' onClick={() => onPick(chosen)}>
            {$t('workshop.useStyle', { 0: styleName(chosen) })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const readDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });

/** Brand basics: the logo, the brand color and the closing page, which every card style draws with. */
export function CardBrandFields({
  fields,
  onChange,
  onError,
  siteIcon,
  project,
}: {
  fields: CardFields;
  onChange: (fields: CardFields) => void;
  onError: (message: string) => void;
  siteIcon: string | null;
  project: Project;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const logo = fields.logo || siteIcon;
  const upload = async (picked: File | undefined) => {
    if (!picked) return;
    if (
      !(LOGO_TYPES as readonly string[]).includes(picked.type) ||
      picked.size > LOGO_BYTES
    ) {
      onError($t('workshop.logoInvalid', { 0: Math.round(LOGO_BYTES / 1024) }));
      return;
    }
    onError('');
    onChange({ ...fields, logo: await readDataUrl(picked) });
  };
  return (
    <div className='grid gap-x-4 gap-y-4 sm:grid-cols-[7rem_minmax(0,1fr)]'>
      <span className='self-start pt-1.5 text-sm font-medium'>
        {$t('workshop.logo')}
      </span>
      <div className='space-y-1.5'>
        <div className='flex flex-wrap items-center gap-3'>
          {logo ? (
            <img
              src={logo}
              alt=''
              className='size-10 shrink-0 rounded-lg border bg-white object-contain p-1'
            />
          ) : (
            <span
              className='grid size-10 shrink-0 place-items-center rounded-lg text-sm font-semibold text-white'
              style={{ background: fields.color }}
            >
              {(project.name || '·').trim().charAt(0).toUpperCase()}
            </span>
          )}
          <span className='text-sm text-muted-foreground'>
            {fields.logo
              ? $t('workshop.logoUploaded')
              : siteIcon
                ? $t('workshop.logoSiteIcon')
                : $t('workshop.logoNone')}
          </span>
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => fileRef.current?.click()}
          >
            {$t('workshop.logoUpload')}
          </Button>
          {fields.logo ? (
            <Button
              type='button'
              size='sm'
              variant='ghost'
              onClick={() => onChange({ ...fields, logo: null })}
            >
              {siteIcon
                ? $t('workshop.logoUseSiteIcon')
                : $t('workshop.logoRemove')}
            </Button>
          ) : null}
          <input
            ref={fileRef}
            type='file'
            hidden
            accept={LOGO_TYPES.join(',')}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        <p className='text-xs text-muted-foreground'>
          {$t('workshop.logoHint', { 0: Math.round(LOGO_BYTES / 1024) })}
        </p>
      </div>

      <Label htmlFor='brand-card-color' className='self-start pt-1.5'>
        {$t('workshop.colorPrimary')}
      </Label>
      <div className='space-y-1.5'>
        <div className='flex items-center gap-2 text-sm'>
          <input
            id='brand-card-color'
            type='color'
            value={fields.color}
            onChange={(e) => onChange({ ...fields, color: e.target.value })}
            className='size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5'
          />
          <span className='font-mono text-xs text-muted-foreground uppercase'>
            {fields.color}
          </span>
        </div>
        <p className='text-xs text-muted-foreground'>
          {$t('workshop.colorPrimaryHint')}
        </p>
      </div>

      <Label htmlFor='brand-ending-heading' className='self-start pt-1.5'>
        {$t('workshop.ending')}
      </Label>
      <div className='space-y-2'>
        <Input
          id='brand-ending-heading'
          maxLength={ENDING_HEADING_MAX}
          placeholder={$t('workshop.endingHeadingPlaceholder')}
          aria-label={$t('workshop.endingHeading')}
          value={fields.endingHeading}
          onChange={(e) =>
            onChange({ ...fields, endingHeading: e.target.value })
          }
        />
        <Input
          maxLength={ENDING_TEXT_MAX}
          placeholder={$t('workshop.endingTextPlaceholder')}
          aria-label={$t('workshop.endingText')}
          value={fields.endingText}
          onChange={(e) => onChange({ ...fields, endingText: e.target.value })}
        />
        <p className='text-xs text-muted-foreground'>
          {$t('workshop.endingHint')}
        </p>
      </div>
    </div>
  );
}

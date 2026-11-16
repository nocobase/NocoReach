import { useDeferredValue, useRef } from 'react';
import { $t } from '#i18n';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import {
  CARD_FONTS,
  ENDING_HEADING_MAX,
  ENDING_TEXT_MAX,
  LOGO_BYTES,
  LOGO_TYPES,
  cardStyle,
  cardTemplate,
  type CardColors,
  type CardFont,
  type TemplateCard,
} from '../../../shared/xhs-card.js';
import { XHS } from '../../../shared/repurpose.js';
import { brandCardsOf, type CardFields } from './model.js';

// Brand and templates › Brand style (Content workshop PR 2): the logo, three colors, font and closing page Xiaohongshu
// cards are rendered with, and a preview drawn by the same template the Agent renders with (shared/xhs-card.ts).

const COLOR_KEYS: readonly (keyof CardColors)[] = [
  'primary',
  'text',
  'background',
];
const colorLabel = (k: keyof CardColors) =>
  k === 'primary'
    ? $t('workshop.colorPrimary')
    : k === 'text'
      ? $t('workshop.colorText')
      : $t('workshop.colorBackground');
const fontLabel = (f: CardFont) =>
  f === 'serif' ? $t('workshop.fontSerif') : $t('workshop.fontSans');

const readDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });

export function CardStyleFields({
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
  project: { name?: string; site?: string };
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
      <span className='pt-1.5 text-sm font-medium'>{$t('workshop.logo')}</span>
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
              className='grid size-10 shrink-0 place-items-center rounded-lg text-sm font-semibold'
              style={{
                background: fields.colors.primary,
                color: fields.colors.background,
              }}
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

      <span className='pt-1.5 text-sm font-medium'>
        {$t('workshop.colors')}
      </span>
      <div className='space-y-1.5'>
        <div className='flex flex-wrap gap-x-5 gap-y-2'>
          {COLOR_KEYS.map((k) => (
            <label key={k} className='flex items-center gap-2 text-sm'>
              <input
                type='color'
                value={fields.colors[k]}
                onChange={(e) =>
                  onChange({
                    ...fields,
                    colors: { ...fields.colors, [k]: e.target.value },
                  })
                }
                className='size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5'
              />
              <span className='flex flex-col leading-tight'>
                <span>{colorLabel(k)}</span>
                <span className='font-mono text-xs text-muted-foreground uppercase'>
                  {fields.colors[k]}
                </span>
              </span>
            </label>
          ))}
        </div>
        <p className='text-xs text-muted-foreground'>
          {$t('workshop.colorsHint', { 0: XHS.colors })}
        </p>
      </div>

      <Label htmlFor='brand-card-font' className='pt-1.5'>
        {$t('workshop.font')}
      </Label>
      <div>
        <Select
          value={fields.font}
          onValueChange={(v) => {
            if (CARD_FONTS.includes(v as CardFont))
              onChange({ ...fields, font: v as CardFont });
          }}
        >
          <SelectTrigger id='brand-card-font' className='w-48'>
            <SelectValue>{(v: CardFont) => fontLabel(v)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CARD_FONTS.map((f) => (
              <SelectItem key={f} value={f}>
                {fontLabel(f)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Label htmlFor='brand-ending-heading' className='pt-1.5'>
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

      <span className='text-sm font-medium'>{$t('workshop.cardPreview')}</span>
      <CardPreview fields={fields} siteIcon={siteIcon} project={project} />
    </div>
  );
}

const SCALE = 0.1;

/** The cover, a content card and the closing page as the template draws them, at a tenth of their size. */
function CardPreview({
  fields,
  siteIcon,
  project,
}: {
  fields: CardFields;
  siteIcon: string | null;
  project: { name?: string; site?: string };
}) {
  const shown = useDeferredValue(fields);
  const style = cardStyle(brandCardsOf(shown), { ...project, icon: siteIcon });
  const cards: TemplateCard[] = [
    {
      layout: 'cover',
      heading: $t('workshop.sampleCoverHeading'),
      text: $t('workshop.sampleCoverText'),
    },
    {
      layout: 'text',
      heading: $t('workshop.sampleCardHeading'),
      text: $t('workshop.sampleCardText'),
    },
    ...(style.ending
      ? [
          {
            layout: 'end' as const,
            heading: style.ending.heading,
            text: style.ending.text,
          },
        ]
      : []),
  ];
  return (
    <ul
      className='flex flex-wrap gap-3'
      aria-label={$t('workshop.cardPreview')}
    >
      {cards.map((card, i) => (
        <li
          key={card.layout}
          className='overflow-hidden rounded-md border'
          style={{ width: XHS.width * SCALE, height: XHS.height * SCALE }}
        >
          <iframe
            title={card.heading}
            tabIndex={-1}
            sandbox='allow-scripts'
            srcDoc={cardTemplate(style, { cards, n: i + 1 })}
            className='pointer-events-none origin-top-left border-0'
            style={{
              width: XHS.width,
              height: XHS.height,
              transform: `scale(${SCALE})`,
            }}
          />
        </li>
      ))}
    </ul>
  );
}

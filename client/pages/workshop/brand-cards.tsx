import { useDeferredValue, useRef, useState } from 'react';
import {
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { $t } from '#i18n';
import { confirmAction } from '#components/reach/confirm';
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
import { formatDate } from '#lib/format';
import { cn } from '#lib/utils';
import {
  DESIGN_NAME_MAX,
  SAVED_STYLES_MAX,
  savedStyleId,
  savedStyleRef,
  type SavedStyle,
} from '../../../shared/card-design.js';
import {
  CARD_TEMPLATES,
  DEFAULT_TEMPLATE,
  ENDING_HEADING_MAX,
  ENDING_TEXT_MAX,
  LOGO_BYTES,
  LOGO_TYPES,
  cardStyle,
  isCardTemplate,
  type CardTemplateId,
  type TemplateCard,
} from '../../../shared/xhs-card.js';
import { CardFrame } from './card-frame.js';
import { CardSkillPicker } from './card-skill-picker.js';
import { CardStyleMaker } from './card-style-maker.js';
import { previewCards, useOverflow45 } from './style-fit.js';
import { CARD_SPECS, type CardSize } from '../../../shared/repurpose.js';
import {
  brandCardsOf,
  errorText,
  workshopRequest,
  type CardFields,
  type CardSkill,
  type StyleRef,
  type WorkshopView,
} from './model.js';

// Brand and templates' card settings (Content workshop PR 2; card styles 2026-11-17, mockup xhs-card-styles.html
// frames 1 to 4): the card style carousel cards are drawn in, chosen from the built-in styles and My styles (styles
// made with AI, card-style-maker.tsx), each previewed with the latest set's own cards, or a Skill that draws the cards
// instead (card-skill-picker.tsx); and the brand basics every style draws with: the logo, the brand color and the closing
// page. The previews are drawn by the template the Agent renders with (shared/xhs-card.ts), the style in use at both of
// the places' sizes (2026-11-24): 3:4 for Xiaohongshu, 4:5 for Instagram and LinkedIn. One of My styles that does not
// fit at 4:5 says so, and Adjust with AI saves a new one that does.

const builtInName = (id: CardTemplateId) =>
  ({
    editorial: $t('workshop.styleEditorial'),
    memo: $t('workshop.styleMemo'),
    dark: $t('workshop.styleDark'),
    checklist: $t('workshop.styleChecklist'),
  })[id];
const builtInFit = (id: CardTemplateId) =>
  ({
    editorial: $t('workshop.styleEditorialFit'),
    memo: $t('workshop.styleMemoFit'),
    dark: $t('workshop.styleDarkFit'),
    checklist: $t('workshop.styleChecklistFit'),
  })[id];
/** A style's name: a built-in one's, or the name it was saved under. A saved style no longer there is the default. */
const styleName = (ref: StyleRef, styles: readonly SavedStyle[]) =>
  isCardTemplate(ref)
    ? builtInName(ref)
    : (styles.find((s) => s.id === savedStyleId(ref))?.name ??
      builtInName(DEFAULT_TEMPLATE));

type Sample = WorkshopView['cardSample'];
export type Project = { name?: string; site?: string };
/** What the brand kit draws the cards with: a style, or a Skill (the style is kept for when the Skill is dropped). */
type Choice = { template: StyleRef; skill: string | null };

/** A style's cover, first card of text and closing page, side by side. */
function StyleTrio({
  fields,
  template,
  styles,
  cards,
  siteIcon,
  project,
  width,
  size,
}: {
  fields: CardFields;
  template: StyleRef;
  styles: readonly SavedStyle[];
  cards: TemplateCard[];
  siteIcon: string | null;
  project: Project;
  width: number;
  size?: CardSize;
}) {
  const style = cardStyle(
    { ...brandCardsOf(fields), template, skill: null },
    { ...project, icon: siteIcon },
    styles,
  );
  const shown = [
    1,
    cards.findIndex((c) => c.layout === 'text') + 1,
    cards.findIndex((c) => c.layout === 'end') + 1,
  ].filter((n, i, all) => n > 0 && all.indexOf(n) === i);
  return (
    <ul className='flex gap-2' aria-label={styleName(template, styles)}>
      {shown.map((n) => (
        <li key={n}>
          <CardFrame
            style={style}
            cards={cards}
            n={n}
            width={width}
            size={size}
            title={cards[n - 1].heading || cards[n - 1].text}
          />
        </li>
      ))}
    </ul>
  );
}

/** The sizes the style in use is previewed at, each named by its places. */
const previewSizes = () => [
  {
    size: CARD_SPECS.xhs,
    label: $t('workshop.previewXhsSize'),
  },
  {
    size: CARD_SPECS.instagram,
    label: $t('workshop.previewPortraitSize'),
  },
];

/** Card style: the style or Skill in use, previewed, and the picker that changes it. */
export function CardStyleSection({
  projectId,
  fields,
  onChange,
  sample,
  siteIcon,
  project,
  styles,
  onStyles,
  skills,
  savedTemplate,
  disabled,
}: {
  projectId: string;
  fields: CardFields;
  onChange: (fields: CardFields) => void;
  sample: Sample;
  siteIcon: string | null;
  project: Project;
  /** My styles, as last read or changed. */
  styles: SavedStyle[];
  onStyles: (styles: SavedStyle[]) => void;
  skills: CardSkill[];
  /** The style the saved brand kit draws with, which cannot be deleted. */
  savedTemplate: string | undefined;
  disabled?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const shown = useDeferredValue(fields);
  const cards = previewCards(sample, shown);
  const mine = styles.find((s) => s.id === savedStyleId(fields.template));
  // One of My styles is checked at 4:5 too; a built-in style is made for both sizes.
  const overflow45 = useOverflow45(
    mine && !fields.skill
      ? cardStyle(
          { ...brandCardsOf(shown), skill: null },
          { ...project, icon: siteIcon },
          styles,
        )
      : null,
    cards,
  );
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
        {fields.skill ? null : (
          <div
            className='flex w-full flex-wrap items-end gap-5'
            data-preview-sizes=''
          >
            {previewSizes().map(({ size, label }) => (
              <figure key={size.height} className='space-y-1.5'>
                <StyleTrio
                  fields={shown}
                  template={shown.template}
                  styles={styles}
                  cards={cards}
                  siteIcon={siteIcon}
                  project={project}
                  width={88}
                  size={size}
                />
                <figcaption className='text-xs text-muted-foreground'>
                  {label}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        <div className='min-w-48 flex-1 space-y-1'>
          <p className='flex items-center gap-2 text-sm font-medium'>
            {fields.skill || styleName(fields.template, styles)}
            {fields.skill ? (
              <Tag tone='cyan'>{$t('workshop.skillTag')}</Tag>
            ) : mine ? (
              <Tag tone='violet'>{$t('workshop.styleByAi')}</Tag>
            ) : (
              <Tag tone='grey'>{$t('workshop.builtIn')}</Tag>
            )}
          </p>
          <p className='text-sm text-muted-foreground'>
            {fields.skill
              ? $t('workshop.skillInUseHint')
              : mine
                ? mine.summary
                : builtInFit(
                    isCardTemplate(fields.template)
                      ? fields.template
                      : DEFAULT_TEMPLATE,
                  )}
          </p>
          {mine && overflow45?.length ? (
            <div
              className='flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-sm text-nr-ink-amber'
              data-overflow-45=''
            >
              <span className='flex items-center gap-1.5'>
                <TriangleAlertIcon
                  className='size-3.5 shrink-0'
                  aria-hidden='true'
                />
                {$t('workshop.styleNoFit45')}
              </span>
              <Button
                type='button'
                size='sm'
                variant='outline'
                disabled={disabled}
                onClick={() => setAdjusting(true)}
              >
                <SparklesIcon />
                {$t('workshop.adjustWithAi')}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      {adjusting && mine ? (
        <CardStyleMaker
          projectId={projectId}
          fields={shown}
          cards={cards}
          siteIcon={siteIcon}
          project={project}
          taken={styles.map((s) => s.name)}
          start={mine}
          onClose={() => setAdjusting(false)}
          onSaved={(style) => {
            onStyles([...styles, style]);
            onChange({ ...fields, template: savedStyleRef(style.id) });
            setAdjusting(false);
          }}
        />
      ) : null}
      {picking ? (
        <StylePicker
          projectId={projectId}
          fields={shown}
          cards={cards}
          sample={sample}
          siteIcon={siteIcon}
          project={project}
          styles={styles}
          onStyles={onStyles}
          skills={skills}
          savedTemplate={savedTemplate}
          onClose={() => setPicking(false)}
          onPick={(choice) => {
            onChange({ ...fields, ...choice });
            setPicking(false);
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * Change style: the built-in styles and My styles, each previewed with the same cards, the one in use marked; a new
 * style made with AI, and a Skill to draw the cards instead.
 */
function StylePicker({
  projectId,
  fields,
  cards,
  sample,
  siteIcon,
  project,
  styles,
  onStyles,
  skills,
  savedTemplate,
  onClose,
  onPick,
}: {
  projectId: string;
  fields: CardFields;
  cards: TemplateCard[];
  sample: Sample;
  siteIcon: string | null;
  project: Project;
  styles: SavedStyle[];
  onStyles: (styles: SavedStyle[]) => void;
  skills: CardSkill[];
  savedTemplate: string | undefined;
  onClose: () => void;
  onPick: (choice: Choice) => void;
}) {
  const [chosen, setChosen] = useState<StyleRef>(fields.template);
  const [making, setMaking] = useState(false);
  const [choosingSkill, setChoosingSkill] = useState(false);
  const inUse = (ref: StyleRef) => !fields.skill && fields.template === ref;
  const option = (ref: StyleRef) =>
    cn(
      'flex flex-col gap-2.5 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
      chosen === ref && 'border-primary ring-1 ring-primary',
    );
  const trio = (template: StyleRef) => (
    <StyleTrio
      fields={fields}
      template={template}
      styles={styles}
      cards={cards}
      siteIcon={siteIcon}
      project={project}
      width={112}
    />
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className='max-h-[92vh] overflow-y-auto sm:max-w-[1040px]'>
        <DialogHeader>
          <DialogTitle>{$t('workshop.cardStyle')}</DialogTitle>
          <DialogDescription>
            {sample
              ? $t('workshop.stylePreviewSample', { 0: sample.subject })
              : $t('workshop.stylePreviewText')}
          </DialogDescription>
        </DialogHeader>
        <div
          role='radiogroup'
          aria-label={$t('workshop.cardStyle')}
          className='space-y-5'
        >
          <div className='space-y-2'>
            <h4 className='text-sm font-semibold'>
              {$t('workshop.builtInStyles')}
            </h4>
            <div className='grid gap-3 sm:grid-cols-2'>
              {CARD_TEMPLATES.map((id) => (
                <button
                  key={id}
                  type='button'
                  role='radio'
                  aria-checked={chosen === id}
                  onClick={() => setChosen(id)}
                  className={option(id)}
                >
                  {trio(id)}
                  <span className='flex items-center gap-2 text-sm font-medium'>
                    {builtInName(id)}
                    {inUse(id) ? (
                      <Tag tone='blue'>{$t('workshop.styleInUse')}</Tag>
                    ) : null}
                  </span>
                  <span className='text-sm text-muted-foreground'>
                    {builtInFit(id)}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className='space-y-2'>
            <h4 className='text-sm font-semibold'>{$t('workshop.myStyles')}</h4>
            <div className='grid gap-3 sm:grid-cols-2'>
              {styles.map((s) => (
                <SavedStyleCard
                  key={s.id}
                  projectId={projectId}
                  style={s}
                  styles={styles}
                  chosen={chosen === savedStyleRef(s.id)}
                  inUse={inUse(savedStyleRef(s.id))}
                  locked={savedTemplate === savedStyleRef(s.id)}
                  className={option(savedStyleRef(s.id))}
                  preview={trio(savedStyleRef(s.id))}
                  onChoose={() => setChosen(savedStyleRef(s.id))}
                  onStyles={(next) => {
                    onStyles(next);
                    if (
                      chosen === savedStyleRef(s.id) &&
                      !next.some((x) => x.id === s.id)
                    )
                      setChosen(DEFAULT_TEMPLATE);
                  }}
                />
              ))}
              <div className='flex flex-col items-start gap-2 rounded-lg border border-dashed p-4'>
                <h5 className='flex items-center gap-1.5 text-sm font-semibold'>
                  <PlusIcon className='size-4' aria-hidden='true' />
                  {$t('workshop.newStyle')}
                </h5>
                <p className='text-sm text-muted-foreground'>
                  {styles.length >= SAVED_STYLES_MAX
                    ? $t('workshop.stylesMax', { 0: SAVED_STYLES_MAX })
                    : $t('workshop.newStyleHint')}
                </p>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  disabled={styles.length >= SAVED_STYLES_MAX}
                  onClick={() => setMaking(true)}
                >
                  {$t('workshop.newStyleStart')}
                </Button>
              </div>
              <div
                className={cn(
                  'flex flex-col items-start gap-2 rounded-lg border border-dashed p-4',
                  fields.skill &&
                    'border-solid border-primary ring-1 ring-primary',
                )}
              >
                <h5 className='flex items-center gap-2 text-sm font-semibold'>
                  {$t('workshop.drawWithSkill')}
                  {fields.skill ? (
                    <Tag tone='blue'>
                      {$t('workshop.skillInUse', { 0: fields.skill })}
                    </Tag>
                  ) : null}
                </h5>
                <p className='text-sm text-muted-foreground'>
                  {$t('workshop.drawWithSkillHint')}
                </p>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={() => setChoosingSkill(true)}
                >
                  {$t('workshop.chooseSkill')}
                </Button>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className='items-center sm:justify-between'>
          <p className='text-xs text-muted-foreground'>
            {$t('workshop.styleNewTasksOnly')}
          </p>
          <div className='flex gap-2'>
            <Button type='button' variant='ghost' onClick={onClose}>
              {$t('common.cancel')}
            </Button>
            <Button
              type='button'
              onClick={() => onPick({ template: chosen, skill: null })}
            >
              {$t('workshop.useStyle', { 0: styleName(chosen, styles) })}
            </Button>
          </div>
        </DialogFooter>
        {making ? (
          <CardStyleMaker
            projectId={projectId}
            fields={fields}
            cards={cards}
            siteIcon={siteIcon}
            project={project}
            taken={styles.map((s) => s.name)}
            onClose={() => setMaking(false)}
            onSaved={(style) => {
              onStyles([...styles, style]);
              setChosen(savedStyleRef(style.id));
              setMaking(false);
            }}
          />
        ) : null}
        {choosingSkill ? (
          <CardSkillPicker
            skills={skills}
            current={fields.skill}
            onClose={() => setChoosingSkill(false)}
            onPick={(skill) => onPick({ template: fields.template, skill })}
            onDrop={() => {
              setChoosingSkill(false);
              onPick({ template: chosen, skill: null });
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** One of My styles: picked like a built-in one, and renamed or deleted in place. */
function SavedStyleCard({
  projectId,
  style,
  styles,
  chosen,
  inUse,
  locked,
  className,
  preview,
  onChoose,
  onStyles,
}: {
  projectId: string;
  style: SavedStyle;
  styles: SavedStyle[];
  chosen: boolean;
  inUse: boolean;
  /** The saved brand kit draws with it. */
  locked: boolean;
  className: string;
  preview: React.ReactNode;
  onChoose: () => void;
  onStyles: (styles: SavedStyle[]) => void;
}) {
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const rename = async () => {
    if (name === null) return;
    setBusy(true);
    setFailure('');
    try {
      const renamed = await workshopRequest<SavedStyle>(
        'renameStyle',
        projectId,
        {
          styleId: style.id,
          name: name.trim(),
        },
      );
      onStyles(styles.map((s) => (s.id === style.id ? renamed : s)));
      setName(null);
    } catch (e) {
      setFailure(errorText(e, $t('common.saveFailed')));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    const ok = await confirmAction({
      title: () => $t('workshop.deleteStyleTitle', { 0: style.name }),
      description: () => $t('workshop.deleteStyleHint'),
      action: () => $t('common.delete'),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setFailure('');
    try {
      await workshopRequest('deleteStyle', projectId, { styleId: style.id });
      onStyles(styles.filter((s) => s.id !== style.id));
    } catch (e) {
      setFailure(errorText(e, $t('workshop.deleteStyleFailed')));
      setBusy(false);
    }
  };
  return (
    <div className={cn(className, 'hover:bg-transparent')}>
      <button
        type='button'
        role='radio'
        aria-checked={chosen}
        onClick={onChoose}
        className='flex flex-col gap-2.5 text-left focus-visible:outline-none'
      >
        {preview}
      </button>
      {name === null ? (
        <span className='flex items-center gap-2 text-sm font-medium'>
          <button
            type='button'
            className='text-left'
            tabIndex={-1}
            onClick={onChoose}
          >
            {style.name}
          </button>
          <Tag tone='violet'>{$t('workshop.styleByAi')}</Tag>
          {inUse ? <Tag tone='blue'>{$t('workshop.styleInUse')}</Tag> : null}
          <span className='ml-auto flex gap-1'>
            <Button
              type='button'
              size='icon-sm'
              variant='ghost'
              disabled={busy}
              aria-label={$t('workshop.renameStyle', { 0: style.name })}
              title={$t('workshop.renameStyleShort')}
              onClick={() => setName(style.name)}
            >
              <PencilIcon />
            </Button>
            <Button
              type='button'
              size='icon-sm'
              variant='ghost'
              disabled={busy || locked}
              aria-label={$t('workshop.deleteStyle', { 0: style.name })}
              title={
                locked
                  ? $t('workshop.styleInUseDelete')
                  : $t('workshop.deleteStyleShort')
              }
              onClick={() => void remove()}
            >
              <Trash2Icon />
            </Button>
          </span>
        </span>
      ) : (
        <form
          className='flex items-center gap-2'
          onSubmit={(e) => {
            e.preventDefault();
            void rename();
          }}
        >
          <Label htmlFor={`style-name-${style.id}`} className='sr-only'>
            {$t('workshop.styleName')}
          </Label>
          <Input
            id={`style-name-${style.id}`}
            autoFocus
            maxLength={DESIGN_NAME_MAX}
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            className='h-8'
          />
          <Button type='submit' size='sm' disabled={busy || !name.trim()}>
            {$t('common.save')}
          </Button>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            disabled={busy}
            onClick={() => setName(null)}
          >
            {$t('common.cancel')}
          </Button>
        </form>
      )}
      <span className='text-sm text-muted-foreground'>
        {style.summary}{' '}
        {$t('workshop.styleSavedBy', {
          0: formatDate(style.savedAt),
          1: style.savedBy.name,
        })}
      </span>
      {failure ? (
        <span className='text-sm text-destructive' role='alert'>
          {failure}
        </span>
      ) : null}
    </div>
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

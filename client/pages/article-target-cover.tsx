import { useId, useState } from 'react';
import { $t, getCurrentLocale } from '#i18n';
import { toast } from '#lib/toast';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Checkbox } from '#components/ui/checkbox';
import { Label } from '#components/ui/label';
import { Spinner } from '#components/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { InfoTip } from '#components/reach/info-tip';
import { joinList } from '#lib/format';
import {
  COVER_RATIO,
  COVER_RATIOS,
  type ArticleTargetView,
  type CoverSettings,
} from '../../shared/article-publishing.js';
import {
  articleRequest,
  errorKey,
  localeName,
  type TargetList,
} from './article-targets-api';

// A target's covers in Data sources › Blog CMS (2026-11-05, ui-references/article-cover-2026-11-05 frame 6): one row
// on its card, read from its latest articles when it is connected or checked, and Edit opening the settings under the
// card. The review card follows them (task-detail/article-cover.tsx).

/** The cover row's text: where covers go, their ratio and narrowest width, and whether new articles need one. */
function coverSummary(t: Pick<ArticleTargetView, 'kind' | 'cover'>) {
  const c = t.cover;
  if (!c) return '';
  const names = c.locales ? [...new Set(Object.values(c.locales))] : [];
  const where =
    t.kind === 'http'
      ? $t('articlePublishing.cover.api')
      : t.kind === 'git-files'
        ? $t('articlePublishing.cover.frontmatter', {
            0: c.field || joinList(names),
          })
        : $t('articlePublishing.cover.field', {
            0: c.field || joinList(names),
          });
  const size = c.ratio
    ? c.minWidth
      ? $t('articlePublishing.cover.ratioWidth', { 0: c.ratio, 1: c.minWidth })
      : c.ratio
    : c.minWidth
      ? $t('articlePublishing.cover.anyRatioWidth', { 0: c.minWidth })
      : $t('articlePublishing.cover.anyRatio');
  return [
    c.locales ? $t('articlePublishing.cover.perLanguage', { 0: where }) : where,
    size,
    $t(
      c.required
        ? 'articlePublishing.cover.required'
        : 'articlePublishing.cover.optional',
    ),
  ].join(' · ');
}

/** Where the settings came from, for the row's ⓘ. */
function coverSource(t: Pick<ArticleTargetView, 'kind' | 'cover'>) {
  const c = t.cover;
  if (c?.edited) return $t('articlePublishing.cover.sourceEdited');
  if (t.kind === 'http') return $t('articlePublishing.cover.sourceApi');
  return $t('articlePublishing.cover.sourceDetected', {
    0: c?.detected?.articles ?? 0,
    1: c?.detected?.covers ?? 0,
  });
}

/** The Cover row's value: the summary, its ⓘ, and Edit at the end of the row for an administrator. */
export function CoverRowValue({
  target: t,
  onEdit,
  disabled,
}: {
  target: ArticleTargetView;
  onEdit?: () => void;
  disabled?: boolean;
}) {
  return (
    <span className='flex min-w-0 flex-wrap items-center gap-x-1.5'>
      <span data-target-cover=''>{coverSummary(t)}</span>
      <InfoTip label={$t('articlePublishing.cover.about')}>
        {coverSource(t)}
      </InfoTip>
      {onEdit && (
        <Button
          variant='link'
          size='sm'
          className='ml-auto h-auto p-0 font-normal'
          aria-label={$t('articlePublishing.cover.editTitle', { 0: t.name })}
          disabled={disabled}
          onClick={onEdit}
        >
          {$t('articlePublishing.cover.edit')}
        </Button>
      )}
    </span>
  );
}

const CUSTOM = 'custom',
  ANY = 'any';
type CoverForm = {
  field: string;
  locales: Record<string, string>;
  ratio: string;
  custom: string;
  minWidth: string;
  required: boolean;
};
const formOf = (c: CoverSettings): CoverForm => ({
  field: c.field || '',
  locales: { ...c.locales },
  ratio: !c.ratio
    ? ANY
    : (COVER_RATIOS as readonly string[]).includes(c.ratio)
      ? c.ratio
      : CUSTOM,
  custom:
    c.ratio && !(COVER_RATIOS as readonly string[]).includes(c.ratio)
      ? c.ratio
      : '',
  minWidth: c.minWidth ? String(c.minWidth) : '',
  required: Boolean(c.required),
});

/**
 * Cover › Edit, under the target's card: the field, the ratio (Any, the common ones or Custom), the narrowest width
 * and whether new articles need one. Detect again reads the latest articles into the form; Save keeps the form, and
 * later checks no longer change it.
 */
export function CoverEditPanel({
  target: t,
  projectId,
  sessionId,
  revision,
  onSaved,
  onStale,
  onCancel,
}: {
  target: ArticleTargetView & { cover: CoverSettings };
  projectId: number;
  sessionId: string;
  revision: number;
  onSaved: (list: TargetList) => void;
  onStale: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [base, setBase] = useState<CoverSettings>(t.cover);
  const [form, setForm] = useState<CoverForm>(() => formOf(t.cover));
  const [busy, setBusy] = useState<'' | 'detect' | 'save'>('');
  const [problem, setProblem] = useState('');
  const set = (patch: Partial<CoverForm>) =>
    setForm((f) => ({ ...f, ...patch }));
  const ui = getCurrentLocale();
  // The fields the latest detection found, and the ones in use.
  const fields = [
    ...new Set(
      [
        ...(base.detected?.fields || []),
        form.field,
        ...Object.values(form.locales),
      ].filter(Boolean),
    ),
  ];
  const ratio = form.ratio === CUSTOM ? form.custom.trim() : form.ratio;
  const width = form.minWidth.trim();
  const invalid =
    (form.ratio === CUSTOM && !COVER_RATIO.test(ratio)) ||
    (width !== '' && !/^\d{1,5}$/.test(width)) ||
    (width !== '' && (Number(width) < 1 || Number(width) > 20000));
  async function detect() {
    setBusy('detect');
    setProblem('');
    try {
      const found = await articleRequest<CoverSettings | null>(
        'detectCover',
        projectId,
        { targetId: t.id },
        sessionId,
      );
      if (!found) setProblem($t('articlePublishing.cover.notFound'));
      else {
        setBase(found);
        setForm(formOf(found));
      }
    } catch (e) {
      setProblem(
        e instanceof Error ? e.message : $t('articlePublishing.testFailed'),
      );
    } finally {
      setBusy('');
    }
  }
  async function save() {
    if (invalid) return;
    setBusy('save');
    setProblem('');
    const { edited: _, ...kept } = base;
    const cover: CoverSettings = {
      ...kept,
      ...(base.locales
        ? { locales: form.locales, field: undefined }
        : { field: form.field || undefined }),
      ratio: form.ratio === ANY ? undefined : ratio,
      minWidth: width ? Number(width) : undefined,
      required: form.required,
    };
    try {
      onSaved(
        await articleRequest<TargetList>(
          'saveCover',
          projectId,
          { revision, targetId: t.id, cover },
          sessionId,
        ),
      );
      toast.success(() => $t('articlePublishing.cover.saved'));
    } catch (e) {
      if (errorKey(e) === 'articles.stale') {
        toast.error(() => $t('articlePublishing.stale'));
        onStale();
      } else
        setProblem(
          e instanceof Error ? e.message : $t('articlePublishing.saveFailed'),
        );
    } finally {
      setBusy('');
    }
  }
  const select = (
    value: string,
    onChange: (v: string) => void,
    label: string,
    labelId?: string,
  ) => (
    <Select
      value={value}
      onValueChange={(v) => onChange(String(v ?? ''))}
      items={fields.map((f) => ({ value: f, label: f }))}
    >
      <SelectTrigger
        className='w-full'
        aria-label={labelId ? undefined : label}
        aria-labelledby={labelId}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {fields.map((f) => (
          <SelectItem key={f} value={f}>
            {f}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  return (
    <section
      aria-label={$t('articlePublishing.cover.editTitle', { 0: t.name })}
      className='flex flex-col gap-4 rounded-xl border bg-card p-4 text-sm'
      data-cover-edit={t.id}
    >
      <div className='grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-6 gap-y-3'>
        {t.kind !== 'http' && (
          <>
            <span id={`${id}-field`} className='text-muted-foreground'>
              {$t('articlePublishing.cover.fieldLabel')}
            </span>
            {base.locales ? (
              <div className='flex flex-col gap-2'>
                {Object.keys(form.locales).map((l) => (
                  <div key={l} className='flex items-center gap-2'>
                    <span className='w-16 shrink-0 text-muted-foreground'>
                      {localeName(l, ui)}
                    </span>
                    {select(
                      form.locales[l],
                      (v) => set({ locales: { ...form.locales, [l]: v } }),
                      `${$t('articlePublishing.cover.fieldLabel')} · ${localeName(l, ui)}`,
                    )}
                  </div>
                ))}
              </div>
            ) : (
              select(
                form.field,
                (v) => set({ field: v }),
                $t('articlePublishing.cover.fieldLabel'),
                `${id}-field`,
              )
            )}
          </>
        )}
        <span id={`${id}-ratio`} className='text-muted-foreground'>
          {$t('articlePublishing.cover.ratioLabel')}
        </span>
        <div className='flex flex-wrap items-center gap-2'>
          <Select
            value={form.ratio}
            onValueChange={(v) => set({ ratio: String(v ?? ANY) })}
            items={[
              { value: ANY, label: $t('articlePublishing.cover.ratioAny') },
              ...COVER_RATIOS.map((r) => ({ value: r, label: r })),
              {
                value: CUSTOM,
                label: $t('articlePublishing.cover.ratioCustom'),
              },
            ]}
          >
            <SelectTrigger className='w-36' aria-labelledby={`${id}-ratio`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>
                {$t('articlePublishing.cover.ratioAny')}
              </SelectItem>
              {COVER_RATIOS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM}>
                {$t('articlePublishing.cover.ratioCustom')}
              </SelectItem>
            </SelectContent>
          </Select>
          {form.ratio === CUSTOM && (
            <Input
              className='w-28'
              value={form.custom}
              placeholder='2.5:1'
              aria-label={$t('articlePublishing.cover.ratioCustom')}
              aria-invalid={Boolean(form.custom) && !COVER_RATIO.test(ratio)}
              onChange={(e) => set({ custom: e.target.value })}
            />
          )}
        </div>
        <Label
          htmlFor={`${id}-width`}
          className='font-normal text-muted-foreground'
        >
          {$t('articlePublishing.cover.minWidthLabel')}
        </Label>
        <div className='flex items-center gap-2'>
          <Input
            id={`${id}-width`}
            className='w-28'
            inputMode='numeric'
            value={form.minWidth}
            aria-invalid={
              width !== '' && (!/^\d{1,5}$/.test(width) || Number(width) < 1)
            }
            onChange={(e) => set({ minWidth: e.target.value })}
          />
          <span className='text-muted-foreground'>px</span>
        </div>
        <span />
        <Label className='gap-2 font-normal'>
          <Checkbox
            checked={form.required}
            onCheckedChange={(v) => set({ required: Boolean(v) })}
          />
          {$t('articlePublishing.cover.requiredLabel')}
        </Label>
      </div>
      {problem && (
        <p role='alert' className='text-destructive'>
          {problem}
        </p>
      )}
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          variant='link'
          size='sm'
          className='h-auto p-0 font-normal'
          disabled={Boolean(busy)}
          onClick={() => void detect()}
        >
          {busy === 'detect' && <Spinner data-icon='inline-start' />}
          {t.kind === 'http'
            ? $t('articlePublishing.cover.readAgain')
            : $t('articlePublishing.cover.detectAgain', { 0: 20 })}
        </Button>
        <Button
          variant='ghost'
          size='sm'
          className='ml-auto'
          disabled={busy === 'save'}
          onClick={onCancel}
        >
          {$t('common.cancel')}
        </Button>
        <Button
          size='sm'
          disabled={Boolean(busy) || invalid}
          onClick={() => void save()}
        >
          {busy === 'save' && <Spinner data-icon='inline-start' />}
          {$t('common.save')}
        </Button>
      </div>
    </section>
  );
}

import {
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from 'react';
import { createUuid } from '@nocobase/app-client';
import {
  ArrowRight,
  CircleAlert,
  ImageIcon,
  ImageUp,
  Plus,
} from 'lucide-react';
import { $t } from '#i18n';
import { cn } from '#lib/utils';
import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  SHARED_COVER,
  coverKeyFor,
} from '../../../shared/article-publishing.js';
import {
  TASK_IMAGE_ACCEPT,
  type MessageImage,
} from '../../../shared/task-images.js';
import type {
  ArticleProposal,
  ArticleTargetRef,
  TaskData,
} from '../task-execution-types';
import { articleLanguages } from './article-model';
import type { ArticleEditSession } from './article-edit-session.js';
import {
  coverCandidates,
  coverRatio,
  coverSrc,
  coverState,
  cropArea,
  cropAxis,
  needsCrop,
} from './article-cover-model.js';
import {
  imageProblem,
  taskImageSrc,
  useImageUpload,
} from './task-images-model.js';
import { text } from './styles.js';

// The cover row of the review card and its full-screen page (2026-11-05, ui-references/article-cover-2026-11-05
// frames 1–5): one row under Status. Empty, a small "+ Add cover" whose popover takes an upload, a drop or a paste, or
// an image of the body or the task; set, a thumbnail at the target's ratio with its size, Replace and Remove; on an
// existing article, the site's cover until it is replaced. An image of another ratio is cut to the target's first, and
// the cut becomes a task image. The Agent never sets one.

const LABEL = `${text.muted} font-normal`;
/** The thumbnail's height; its width follows the target's ratio. */
const THUMB_HEIGHT = 30;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = src;
  });
const stem = (name: string) =>
  name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const typeOf = (ref: string) => {
  const ext = /\.([a-z0-9]+)$/i.exec(ref)?.[1]?.toLowerCase();
  return ext === 'jpg' || ext === 'jpeg'
    ? 'image/jpeg'
    : ext === 'webp'
      ? 'image/webp'
      : 'image/png';
};

/** The part of an image chosen in Adjust cover, as a file to upload: JPEG and WebP stay so, anything else is PNG. */
async function cropped(
  img: HTMLImageElement,
  area: ReturnType<typeof cropArea>,
  name: string,
  type: string,
) {
  const canvas = document.createElement('canvas');
  canvas.width = area.width;
  canvas.height = area.height;
  canvas
    .getContext('2d')
    ?.drawImage(
      img,
      area.x,
      area.y,
      area.width,
      area.height,
      0,
      0,
      area.width,
      area.height,
    );
  const out = EXT[type] && type !== 'image/png' ? type : 'image/png';
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, out, 0.92),
  );
  if (!blob) throw new Error('crop');
  return new File([blob], `${stem(name)}-cover.${EXT[out]}`, { type: out });
}

type Crop = {
  img: HTMLImageElement;
  name: string;
  type: string;
  /** A picked file's preview address, let go when the dialog closes. */
  revoke?: string;
};

/** The cover row for the language shown, or nothing when the target keeps no covers. */
export function ArticleCoverRow({
  data,
  article: a,
  session,
  tab,
  id,
  error,
}: {
  data: TaskData;
  article: ArticleProposal;
  session: ArticleEditSession;
  tab: string;
  /** The form's id prefix: the row's button is `${id}-cover`, focused when approval needs a cover. */
  id: string;
  error?: string;
}) {
  const { target, base } = articleLanguages(data, a);
  const upload = useImageUpload();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [crop, setCrop] = useState<Crop | null>(null);
  const [size, setSize] = useState<{
    src: string;
    width: number;
    height: number;
  }>();
  const key = target ? coverKeyFor(target, tab) : null;
  if (!target || key === null) return null;
  const { form, readOnly } = session;
  const { value, site, state } = coverState(form.cover, base?.cover, key);
  const ratio = coverRatio(target),
    minWidth = target.cover?.minWidth;
  const src = coverSrc(value, target);
  const shown = size?.src === src ? size : undefined;
  const set = (next: string) =>
    session.set({ ...form, cover: { ...form.cover, [key]: next } });

  const uploadAndSet = async (file: File) => {
    setBusy(true);
    try {
      set((await upload(file, createUuid())).ref);
    } catch {
      setProblem($t('taskImages.uploadFailed', { 0: file.name }));
    } finally {
      setBusy(false);
    }
  };
  /** A file from the computer: cut to the ratio first when it is another. */
  const chooseFile = async (file: File) => {
    setProblem('');
    const why = imageProblem(file, 0, 1);
    if (why) return setProblem(why);
    const preview = URL.createObjectURL(file);
    try {
      const img = await loadImage(preview);
      if (needsCrop(img.naturalWidth, img.naturalHeight, ratio))
        return setCrop({
          img,
          name: file.name,
          type: file.type,
          revoke: preview,
        });
      URL.revokeObjectURL(preview);
      await uploadAndSet(file);
    } catch {
      URL.revokeObjectURL(preview);
      setProblem($t('articleCover.unreadable', { 0: file.name }));
    }
  };
  /** An image the task has: used as it is, or cut to the ratio into a new task image. */
  const chooseImage = async (image: MessageImage) => {
    setProblem('');
    try {
      const img = await loadImage(taskImageSrc(image.ref));
      if (needsCrop(img.naturalWidth, img.naturalHeight, ratio))
        return setCrop({ img, name: image.name, type: typeOf(image.ref) });
      set(image.ref);
    } catch {
      setProblem($t('articleCover.unreadable', { 0: image.name }));
    }
  };
  const closeCrop = () => {
    if (crop?.revoke) URL.revokeObjectURL(crop.revoke);
    setCrop(null);
  };
  // Remove takes back the cover set here: an existing article goes back to the site's own.
  const remove = () => set(a.articleId ? site : '');
  const candidates = coverCandidates(
    data,
    Object.values(form.locales).map((l) => l.body),
  );
  const picker = (trigger: ReactElement) => (
    <CoverPicker
      trigger={trigger}
      candidates={candidates}
      ratio={target.cover?.ratio}
      disabled={busy || readOnly}
      onFile={(f) => void chooseFile(f)}
      onImage={(i) => void chooseImage(i)}
    />
  );
  const narrow = state === 'set' && shown && minWidth && shown.width < minWidth;
  return (
    <div
      className='grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 text-sm'
      data-cover-row={key}
      onDragOver={(e) => {
        if (!readOnly && e.dataTransfer.types.includes('Files'))
          e.preventDefault();
      }}
      onDrop={(e) => {
        const file = e.dataTransfer.files[0];
        if (readOnly || !file) return;
        e.preventDefault();
        void chooseFile(file);
      }}
    >
      <span id={`${id}-cover-label`} className={LABEL}>
        {$t('articleTask.field.cover')}
      </span>
      <div className='flex min-h-7.5 min-w-0 flex-wrap items-center gap-x-3 gap-y-1'>
        {state === 'empty' ? (
          picker(
            <Button
              id={`${id}-cover`}
              variant='outline'
              size='sm'
              aria-describedby={error ? `${id}-cover-error` : undefined}
              aria-invalid={Boolean(error)}
              className={cn(
                'h-6 border-dashed px-2 font-normal',
                error && 'border-destructive text-destructive',
              )}
            >
              <Plus />
              {$t('articleCover.add')}
            </Button>,
          )
        ) : (
          <CoverThumb
            src={src}
            ratio={ratio}
            alt={$t('articleTask.field.cover')}
            onSize={(width, height) => setSize({ src, width, height })}
          />
        )}
        {state === 'set' && shown && (
          <span className='text-muted-foreground tabular-nums'>
            {shown.width} × {shown.height}
          </span>
        )}
        {state === 'site' && (
          <span className='text-muted-foreground'>
            {$t('articleCover.siteCover')}
          </span>
        )}
        {state !== 'empty' &&
          !readOnly &&
          picker(
            <Button
              id={`${id}-cover`}
              variant='link'
              size='sm'
              className='h-auto p-0 font-normal'
            >
              {$t('articleCover.replace')}
            </Button>,
          )}
        {state === 'set' && !readOnly && (
          <Button
            variant='link'
            size='sm'
            className='h-auto p-0 font-normal text-muted-foreground'
            disabled={busy}
            onClick={remove}
          >
            {$t('articleCover.remove')}
          </Button>
        )}
        {key === SHARED_COVER && (
          <span className='text-muted-foreground'>
            {$t('articleCover.shared')}
          </span>
        )}
        {narrow && (
          <span className='text-muted-foreground'>
            {$t('articleCover.blurry', { 0: minWidth })}
          </span>
        )}
        {busy && (
          <span
            role='status'
            className='inline-flex items-center gap-1 text-muted-foreground'
          >
            <Spinner className='size-3.5' />
            {$t('articleCover.uploading')}
          </span>
        )}
      </div>
      {(error || problem) && (
        <p
          id={`${id}-cover-error`}
          role='alert'
          className='col-start-2 flex items-center gap-1 text-destructive'
        >
          <CircleAlert aria-hidden='true' className='size-3.5 shrink-0' />
          {error || problem}
        </p>
      )}
      {crop && ratio !== null && (
        <CoverCropDialog
          crop={crop}
          ratio={ratio}
          ratioLabel={target.cover?.ratio || ''}
          minWidth={minWidth}
          onCancel={closeCrop}
          onUse={(area) => {
            const { img, name, type } = crop;
            closeCrop();
            void cropped(img, area, name, type)
              .then(uploadAndSet)
              .catch(() =>
                setProblem($t('taskImages.uploadFailed', { 0: name })),
              );
          }}
        />
      )}
    </div>
  );
}

/** A cover's thumbnail at the target's ratio, 30 px high; it opens large. */
export function CoverThumb({
  src,
  ratio,
  alt,
  onSize,
}: {
  src: string;
  ratio: number | null;
  alt: string;
  onSize?: (width: number, height: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [natural, setNatural] = useState<number>();
  const width = Math.round(
    THUMB_HEIGHT * Math.min(4, Math.max(1, ratio ?? natural ?? 16 / 9)),
  );
  if (!src)
    return (
      <span
        className='flex items-center justify-center rounded-sm border bg-muted text-muted-foreground'
        style={{ width, height: THUMB_HEIGHT }}
      >
        <ImageIcon aria-hidden='true' className='size-3.5' />
      </span>
    );
  return (
    <>
      <button
        type='button'
        className='block shrink-0 overflow-hidden rounded-sm border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
        style={{ width, height: THUMB_HEIGHT }}
        aria-label={$t('articleCover.open')}
        title={$t('articleCover.open')}
        onClick={() => setOpen(true)}
      >
        <img
          src={src}
          alt={alt}
          className='size-full object-cover'
          onLoad={(e) => {
            const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
            if (w && h) {
              setNatural(w / h);
              onSize?.(w, h);
            }
          }}
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='flex max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] flex-col gap-3 sm:max-w-4xl'>
          <DialogTitle>{alt}</DialogTitle>
          <div className='flex min-h-0 flex-1 items-center justify-center overflow-auto'>
            <img
              src={src}
              alt={alt}
              className='max-h-[75dvh] max-w-full object-contain'
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * + Add cover's and Replace's popover: drop or paste an image, or upload one; or pick one of the body's or the task's
 * images.
 */
function CoverPicker({
  trigger,
  candidates,
  ratio,
  disabled,
  onFile,
  onImage,
}: {
  trigger: ReactElement;
  candidates: MessageImage[];
  ratio?: string;
  disabled?: boolean;
  onFile: (file: File) => void;
  onImage: (image: MessageImage) => void;
}) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);
  const take = (file?: File | null) => {
    if (!file) return;
    setOpen(false);
    onFile(file);
  };
  const onPaste = (e: ClipboardEvent) => {
    const file = Array.from(e.clipboardData.files)[0];
    if (!file) return;
    e.preventDefault();
    take(file);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    take(e.dataTransfer.files[0]);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger disabled={disabled} render={trigger} />
      <PopoverContent align='start' className='w-80 gap-3 p-3'>
        <input
          ref={pickerRef}
          type='file'
          accept={TASK_IMAGE_ACCEPT}
          hidden
          onChange={(e) => {
            take(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <div
          tabIndex={0}
          role='group'
          aria-label={$t('articleCover.dropHint')}
          className='flex flex-col items-center gap-1 rounded-md border border-dashed px-3 py-4 text-center text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'
          onPaste={onPaste}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <ImageUp aria-hidden='true' className='size-5' />
          <span>{$t('articleCover.dropHint')}</span>
          <Button
            variant='link'
            size='sm'
            className='h-auto p-0'
            onClick={() => pickerRef.current?.click()}
          >
            {$t('articleCover.upload')}
          </Button>
        </div>
        {candidates.length > 0 && (
          <div className='flex flex-col gap-1.5'>
            <span className='text-xs text-muted-foreground'>
              {$t('articleCover.pickFrom')}
            </span>
            <ul className='grid max-h-48 grid-cols-3 gap-2 overflow-auto'>
              {candidates.map((image) => (
                <li key={image.id}>
                  <button
                    type='button'
                    className='block h-14 w-full overflow-hidden rounded-md border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
                    aria-label={$t('articleCover.useImage', { 0: image.name })}
                    title={image.name}
                    onClick={() => {
                      setOpen(false);
                      onImage(image);
                    }}
                  >
                    <img
                      src={taskImageSrc(image.ref)}
                      alt={image.name}
                      loading='lazy'
                      className='size-full object-cover'
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {ratio && (
          <p className='text-xs text-muted-foreground'>
            {$t('articleCover.ratioHint', { 0: ratio })}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Adjust cover (frame 5): the image with the part kept at the target's ratio, dragged (or moved with the arrow keys)
 * along the side it is cut on; Use uploads that part.
 */
function CoverCropDialog({
  crop,
  ratio,
  ratioLabel,
  minWidth,
  onCancel,
  onUse,
}: {
  crop: Crop;
  ratio: number;
  ratioLabel: string;
  minWidth?: number;
  onCancel: () => void;
  onUse: (area: ReturnType<typeof cropArea>) => void;
}) {
  const { naturalWidth: w, naturalHeight: h } = crop.img;
  const [offset, setOffset] = useState(0.5);
  const dragRef = useRef<{
    start: number;
    offset: number;
    span: number;
  } | null>(null);
  const area = cropArea(w, h, ratio, offset);
  const axis = cropAxis(w, h, ratio);
  const box = {
    left: `${(area.x / w) * 100}%`,
    top: `${(area.y / h) * 100}%`,
    width: `${(area.width / w) * 100}%`,
    height: `${(area.height / h) * 100}%`,
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const frame = e.currentTarget.parentElement!.getBoundingClientRect();
    // How far the box can travel on screen, for turning a drag into an offset.
    const span =
      axis === 'x'
        ? frame.width * (1 - area.width / w)
        : frame.height * (1 - area.height / h);
    dragRef.current = {
      start: axis === 'x' ? e.clientX : e.clientY,
      offset,
      span,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.span <= 0) return;
    const moved = (axis === 'x' ? e.clientX : e.clientY) - d.start;
    setOffset(Math.min(1, Math.max(0, d.offset + moved / d.span)));
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step =
      (axis === 'x' && e.key === 'ArrowLeft') ||
      (axis === 'y' && e.key === 'ArrowUp')
        ? -0.05
        : (axis === 'x' && e.key === 'ArrowRight') ||
            (axis === 'y' && e.key === 'ArrowDown')
          ? 0.05
          : 0;
    if (!step) return;
    e.preventDefault();
    setOffset((o) => Math.min(1, Math.max(0, o + step)));
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className='flex max-h-[calc(100dvh-2rem)] flex-col gap-4 sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{$t('articleCover.adjustTitle')}</DialogTitle>
          <DialogDescription>
            {$t('articleCover.adjustRatio', { 0: ratioLabel })}
          </DialogDescription>
        </DialogHeader>
        <div className='flex min-h-0 justify-center'>
          <div className='relative max-w-full overflow-hidden rounded-md select-none'>
            <img
              src={crop.img.src}
              alt=''
              draggable={false}
              className='block max-h-[60dvh] max-w-full'
            />
            <div
              role='slider'
              tabIndex={0}
              aria-label={$t('articleCover.cropArea')}
              aria-orientation={axis === 'x' ? 'horizontal' : 'vertical'}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(offset * 100)}
              className={cn(
                'absolute cursor-grab touch-none outline-2 outline-white focus-visible:outline-primary active:cursor-grabbing',
              )}
              style={{ ...box, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.55)' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => (dragRef.current = null)}
              onPointerCancel={() => (dragRef.current = null)}
              onKeyDown={onKeyDown}
            />
          </div>
        </div>
        <DialogFooter className='items-center sm:justify-between'>
          <span className='text-sm text-muted-foreground tabular-nums'>
            {$t('articleCover.adjustSizes', {
              0: `${w} × ${h}`,
              1: `${area.width} × ${area.height}`,
            })}
            {minWidth && area.width < minWidth
              ? ` · ${$t('articleCover.blurry', { 0: minWidth })}`
              : ''}
          </span>
          <div className='flex gap-2'>
            <Button variant='ghost' onClick={onCancel}>
              {$t('common.cancel')}
            </Button>
            <Button onClick={() => onUse(area)}>
              {$t('articleCover.use')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A cover change in Compare with original and a version's changes: the cover before and after, as thumbnails. */
export function CoverChange({
  before,
  after,
  target,
}: {
  before: string;
  after: string;
  target?: ArticleTargetRef;
}) {
  const ratio = coverRatio(target),
    label = $t('articleTask.field.cover');
  const thumb = (value: string, alt: string) =>
    value ? (
      <CoverThumb src={coverSrc(value, target)} ratio={ratio} alt={alt} />
    ) : (
      <span className='text-muted-foreground'>{$t('articleCover.none')}</span>
    );
  return (
    <div
      className='flex flex-wrap items-center gap-x-3 gap-y-1 text-sm'
      data-cover-change=''
    >
      <span className={LABEL}>{label}</span>
      {thumb(before, $t('articleCover.before'))}
      <ArrowRight
        aria-hidden='true'
        className='size-3.5 text-muted-foreground'
      />
      {thumb(after, $t('articleCover.after'))}
    </div>
  );
}

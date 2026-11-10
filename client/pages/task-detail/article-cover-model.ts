import {
  COVER_RATIO_TOLERANCE,
  ratioValue,
  type ArticleCovers,
} from '../../../shared/article-publishing.js';
import {
  taskImageOf,
  taskImageRef,
  taskImagesIn,
  type MessageImage,
} from '../../../shared/task-images.js';
import type { ArticleTargetRef, TaskData } from '../task-execution-types';
import { taskImageSrc } from './task-images-model.js';

// Covers on the review card (2026-11-05, ui-references/article-cover-2026-11-05): where the browser loads one from,
// which images can be picked, and how an image of another ratio is cut to the target's. The parts that show them are
// in article-cover.tsx.

type CoverTarget = Pick<ArticleTargetRef, 'pages' | 'cover'>;

/**
 * Where the browser loads a cover from: a task image from the app, a site's address as it is, and a site path (a Git
 * target's `/images/blog/x.png`) from the site its pages are on. '' when it cannot tell.
 */
export function coverSrc(value: string, target?: CoverTarget) {
  if (!value) return '';
  if (taskImageOf(value)) return taskImageSrc(value);
  if (/^https?:\/\//i.test(value)) return value;
  const page = Object.values(target?.pages || {}).flat()[0];
  if (value.startsWith('/') && page)
    try {
      return new URL(value, page.split('{slug}').join('x')).href;
    } catch {
      return '';
    }
  return '';
}

/** The target's ratio as width over height, or null when any will do. */
export const coverRatio = (target?: CoverTarget) =>
  ratioValue(target?.cover?.ratio);

/** Whether an image needs cutting to the ratio: further off it than the site's own covers may be. */
export const needsCrop = (
  width: number,
  height: number,
  ratio: number | null,
) =>
  ratio !== null &&
  Math.abs(width / height / ratio - 1) > COVER_RATIO_TOLERANCE;

/**
 * The largest part of an image at the ratio, `offset` (0 to 1) along the side it is cut on: an image wider than the
 * ratio loses its sides, a taller one its top and bottom.
 */
export function cropArea(
  width: number,
  height: number,
  ratio: number,
  offset: number,
) {
  const at = Math.min(1, Math.max(0, offset));
  if (width / height > ratio) {
    const w = Math.min(width, Math.round(height * ratio));
    return { x: Math.round((width - w) * at), y: 0, width: w, height };
  }
  const h = Math.min(height, Math.round(width / ratio));
  return { x: 0, y: Math.round((height - h) * at), width, height: h };
}

/** The side a crop moves along: across for an image wider than the ratio, up and down otherwise. */
export const cropAxis = (width: number, height: number, ratio: number) =>
  width / height > ratio ? 'x' : 'y';

/**
 * The task images a cover can be picked from: those in the article's body, in every language, then those sent with
 * messages and change requests, each once.
 */
export function coverCandidates(
  data: TaskData,
  bodies: (string | undefined)[],
): MessageImage[] {
  const out = new Map<string, MessageImage>();
  for (const body of bodies)
    for (const image of taskImagesIn(body))
      if (!out.has(image.id))
        out.set(image.id, {
          id: image.id,
          name: image.alt || image.id,
          ref: taskImageRef(image.id, image.ext),
        });
  for (const e of data.work?.history || [])
    if (Array.isArray(e.images))
      for (const image of e.images)
        if (!out.has(image.id) && taskImageOf(image.ref))
          out.set(image.id, image);
  return [...out.values()];
}

/** The cover a key shows, and how it stands: none, the site's own (an existing article), or one set on the card. */
export function coverState(
  form: ArticleCovers | undefined,
  base: ArticleCovers | undefined,
  key: string,
) {
  const value = form?.[key] || '',
    site = base?.[key] || '';
  return {
    value,
    site,
    state: !value
      ? ('empty' as const)
      : value === site
        ? ('site' as const)
        : ('set' as const),
  };
}

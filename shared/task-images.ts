import { TASK_MEDIA_COUNT } from './manual-task.js';

// Images a person adds to a started task (2026-11-03): with a message to the Agent or a change request in Activity,
// or pasted into Edit directly. They are task media files (`nrTaskMedia`), linked to the task when the message is sent
// or the edit saved. An article refers to one by its path below; publishing uploads the ones the article uses to the
// target and writes the target's address in their place.

/** Where the application serves task media; an article refers to an image by this path and the file's id. */
export const TASK_IMAGE_PATH = '/uploads/task-media/';
export const TASK_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;
export const TASK_IMAGE_ACCEPT = TASK_IMAGE_TYPES.join(',');
/** The images one message takes, as many as a new task's attachments. */
export const TASK_IMAGES_PER_MESSAGE = TASK_MEDIA_COUNT;
export const isTaskImageType = (type: string) =>
  TASK_IMAGE_TYPES.some((t) => t === type);

/** An image as a message keeps it: the file, its name when added and the path an article uses for it. */
export type MessageImage = { id: string; name: string; ref: string };

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// The path, after the application's base path or origin if any, up to the query or fragment.
const REF = new RegExp(
  `^(?:[a-z][a-z0-9+.-]*://[^/]+)?(?:/[A-Za-z0-9._~-]+)*${TASK_IMAGE_PATH.replace(/\//g, '\\/')}(${UUID})(?:\\.([a-z0-9]{1,32}))?(?:[?#].*)?$`,
);
// A Markdown image: ![alt](address "title"), the address optionally in angle brackets.
const IMAGE =
  /!\[((?:\\.|[^\]\\])*)\]\(\s*(<[^>\n]*>|[^\s)]+)(\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g;

/** The path an article uses for a task image. */
export const taskImageRef = (id: string, ext?: string) =>
  `${TASK_IMAGE_PATH}${id}${ext ? `.${ext}` : ''}`;

/** The task image an address points to, or null for any other address. */
export function taskImageOf(
  address: string | undefined,
): { id: string; ext: string } | null {
  const match = REF.exec((address || '').trim());
  return match ? { id: match[1], ext: match[2] || '' } : null;
}

const unwrap = (address: string) =>
  address.startsWith('<') && address.endsWith('>')
    ? address.slice(1, -1)
    : address;

/** The task images a Markdown text shows, in order, with their alternative text; one image may appear twice. */
export function taskImagesIn(
  markdown: string | undefined,
): { id: string; ext: string; alt: string; address: string }[] {
  const out: { id: string; ext: string; alt: string; address: string }[] = [];
  for (const m of (markdown || '').matchAll(IMAGE)) {
    const address = unwrap(m[2]),
      image = taskImageOf(address);
    if (image)
      out.push({ ...image, alt: m[1].replace(/\\(.)/g, '$1'), address });
  }
  return out;
}

/** Every image a Markdown text shows, task images and others, in order: their addresses and alternative text. */
export function imagesIn(
  markdown: string | undefined,
): { address: string; alt: string }[] {
  return [...(markdown || '').matchAll(IMAGE)].map((m) => ({
    address: unwrap(m[2]),
    alt: m[1].replace(/\\(.)/g, '$1'),
  }));
}

/** The text with each task image's address replaced by `to(id)`; an image `to` gives nothing for stays as it is. */
export function replaceTaskImages(
  markdown: string,
  to: (id: string) => string | undefined,
): string {
  return markdown.replace(
    IMAGE,
    (whole, alt: string, address: string, title = '') => {
      const image = taskImageOf(unwrap(address)),
        next = image && to(image.id);
      return next ? `![${alt}](${next}${title})` : whole;
    },
  );
}

/** The ids of the task images any of the texts show, each once. */
export function taskImageIds(texts: (string | undefined)[]): string[] {
  return [...new Set(texts.flatMap((t) => taskImagesIn(t).map((i) => i.id)))];
}

/**
 * How a text's images changed from `before` to `after`, by address: an added image where one was removed counts as
 * replacing it, in order; the rest are added or removed.
 */
export function imageChanges(
  before: string | undefined,
  after: string | undefined,
): {
  replaced: {
    image: { address: string; alt: string };
    was: { address: string; alt: string };
  }[];
  added: { address: string; alt: string }[];
  removed: { address: string; alt: string }[];
} {
  const unique = (list: { address: string; alt: string }[]) =>
    list.filter((i, n) => list.findIndex((j) => j.address === i.address) === n);
  const was = unique(imagesIn(before)),
    now = unique(imagesIn(after));
  const added = now.filter((i) => !was.some((j) => j.address === i.address)),
    removed = was.filter((i) => !now.some((j) => j.address === i.address));
  const n = Math.min(added.length, removed.length);
  return {
    replaced: added.slice(0, n).map((image, i) => ({ image, was: removed[i] })),
    added: added.slice(n),
    removed: removed.slice(n),
  };
}

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from 'react';
import { createUuid, resolveAppUrl } from '@nocobase/app-client';
import { $t } from '#i18n';
import { formatDate } from '#lib/format';
import {
  TASK_MEDIA_LIMIT,
  isTaskDocument,
  type TaskMediaView,
} from '../../../shared/manual-task.js';
import {
  isTaskImageType,
  messageFileKind,
  taskImageOf,
  taskImageRef,
  type MessageDocument,
  type MessageImage,
} from '../../../shared/task-images.js';
import type { TaskData } from '../task-execution-types';

// Images on a started task (2026-11-03 user request): added to a message or change request in Activity, or pasted
// into Edit directly. They upload as the person adds them and are linked to the task when the message is sent or the
// edit saved; an article shows one by its task media path, which publishing replaces with the target's address.
// A message or change request takes documents as well (2026-11-15), which only inform the Agent. The parts that show
// them are in task-images.tsx.

/** Where the page's uploads go: the task the images are for. */
export type TaskImageScope = { projectId: number; taskId: string };
export const TaskImageContext = createContext<TaskImageScope | null>(null);

/** The address the browser loads a task image from (the path an article uses, under the app's base path). */
export const taskImageSrc = (ref: string) => resolveAppUrl(ref);

/**
 * The line under each new task image while the article is reviewed, by the image's id: where it came from. It is the
 * review's own and never part of the article.
 */
export const ArticleImageNotesContext = createContext<ReadonlyMap<
  string,
  string
> | null>(null);

/** Why a picked file was not added to an image-only input (the article's body and Edit directly): type, size or limit. */
export function imageProblem(file: File, count: number, max: number) {
  if (!isTaskImageType(file.type))
    return $t('taskImages.typeRejected', { 0: file.name });
  if (file.size > TASK_MEDIA_LIMIT)
    return $t('taskImages.tooLarge', { 0: file.name });
  if (count >= max) return $t('taskImages.tooMany', { 0: max });
  return '';
}

/**
 * Why a picked file was not added to a message or change request (2026-11-15): a type a new task does not take, a
 * legacy Office format, the size, or the message's limit, counting images and documents together.
 */
export function messageFileProblem(file: File, count: number, max: number) {
  const kind = messageFileKind(file.name, file.type);
  if (kind?.kind === 'legacy')
    return $t('taskFiles.legacyFormat', { 0: file.name });
  if (!kind) return $t('taskFiles.typeRejected', { 0: file.name });
  if (file.size > TASK_MEDIA_LIMIT)
    return $t('taskImages.tooLarge', { 0: file.name });
  if (count >= max) return $t('taskFiles.tooMany', { 0: max });
  return '';
}

/** A refused task media request, with the reason the server gave when it gave one. */
class MediaError extends Error {
  constructor(
    readonly status: number,
    readonly reason?: string,
  ) {
    super(`Task media request failed: ${status}`);
  }
}

// The task media endpoints (server/routes/manual-tasks.ts) take a file as multipart form data, which the pages' JSON
// client does not send; the request carries the sign-in cookie as that client's do.
async function media(path: string, init: RequestInit) {
  const response = await fetch(
    resolveAppUrl(`/api/nocoreachTasks/media${path}`),
    {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      ...init,
    },
  );
  if (!response.ok) {
    const body = (await Promise.resolve()
      .then(() => response.json())
      .catch(() => null)) as { error?: { reason?: unknown } } | null;
    const reason = body?.error?.reason;
    throw new MediaError(
      response.status,
      typeof reason === 'string' ? reason : undefined,
    );
  }
  return response;
}

/** A file uploaded for the task, as a message keeps it: an image, or a document with its type and size. */
type Uploaded = MessageImage & { type: string; size: number };

/** The file a media request stored, by the address a message and an article keep (without the app's base path). */
async function storedFile(response: Response): Promise<Uploaded> {
  const { data } = (await response.json()) as { data: TaskMediaView };
  const stored = taskImageOf(data.contentUrl);
  return {
    id: data.id,
    name: data.filename,
    ref: taskImageRef(data.id, stored?.ext),
    type: data.mimeType,
    size: data.size,
  };
}
const imageOf = ({ id, name, ref }: Uploaded): MessageImage => ({
  id,
  name,
  ref,
});

const mediaQuery = (scope: TaskImageScope, requestId: string) =>
  new URLSearchParams({
    projectId: String(scope.projectId),
    requestId,
    taskId: scope.taskId,
  });

/** Upload one image or document for the task; the server keeps it unlinked until a message or an edit uses it. */
function useTaskFileUpload() {
  const scope = useContext(TaskImageContext);
  return async (file: File, requestId: string): Promise<Uploaded> => {
    if (!scope) throw new Error('Task images need the task page.');
    const body = new FormData();
    body.set('file', file);
    return storedFile(
      await media(`?${mediaQuery(scope, requestId)}`, { method: 'POST', body }),
    );
  };
}

/** Upload one image for the task; the server keeps it unlinked until a message or an edit uses it. */
export function useImageUpload() {
  const upload = useTaskFileUpload();
  return async (file: File, requestId: string): Promise<MessageImage> =>
    imageOf(await upload(file, requestId));
}

/**
 * Copy an image pasted from another site into the task (2026-11-12): the server reads its address and keeps it as an
 * upload, like one picked from a file.
 */
export function useImageImport() {
  const scope = useContext(TaskImageContext);
  return async (url: string, requestId: string): Promise<MessageImage> => {
    if (!scope) throw new Error('Task images need the task page.');
    return imageOf(
      await storedFile(
        await media(`/import?${mediaQuery(scope, requestId)}`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url }),
        }),
      ),
    );
  };
}

/** Discard a file the person removed before sending; it was never linked. */
const discard = (file: { id: string }) =>
  media(`/${encodeURIComponent(file.id)}`, { method: 'DELETE' }).catch(
    () => undefined,
  );

/** A file a message's draft keeps: an image, or a document, which also keeps its type. */
export type MessageFile = MessageImage | MessageDocument;
export const isMessageDocument = (file: MessageFile): file is MessageDocument =>
  'type' in file && typeof file.type === 'string' && isTaskDocument(file.type);

/**
 * The files a message's draft keeps (JSON) in the order they were added, or none when it holds anything else. A draft
 * from before documents (2026-11-15) holds images only.
 */
export function readMessageFiles(stored: string): MessageFile[] {
  if (!stored) return [];
  try {
    const value: unknown = JSON.parse(stored);
    return Array.isArray(value)
      ? value.filter((i): i is MessageFile => {
          const file = i as Partial<MessageDocument> | null;
          return (
            Boolean(file) &&
            typeof file!.id === 'string' &&
            typeof file!.name === 'string' &&
            typeof file!.ref === 'string' &&
            (file!.type === undefined ||
              (typeof file!.type === 'string' &&
                isTaskDocument(file!.type) &&
                typeof file!.size === 'number'))
          );
        })
      : [];
  } catch {
    return [];
  }
}

export type ComposerImage = {
  key: string;
  name: string;
  /** What the thumbnail shows: the picked file until the upload answers, then the stored image. */
  preview: string;
  image?: MessageImage;
};
export type ComposerDocument = {
  key: string;
  name: string;
  size: number;
  document?: MessageDocument;
};
type ComposerEntry =
  | ({ kind: 'image' } & ComposerImage)
  | ({ kind: 'document' } & ComposerDocument);
const storedOf = (entry: ComposerEntry): MessageFile | undefined =>
  entry.kind === 'image' ? entry.image : entry.document;

/**
 * The files a message to the Agent or a change request may carry, as Activity's message box adds them: by paste,
 * drop or Add attachment, uploaded at once and sent with the message. Images are numbered among themselves (Image 1,
 * Image 2); documents show by name (2026-11-15). `stored` keeps the uploaded ones with the message's draft, so leaving
 * the page and coming back keeps them.
 */
export function useComposerFiles({
  stored,
  store,
  max,
}: {
  stored: MessageFile[];
  store: (files: MessageFile[]) => void;
  max: number;
}) {
  const upload = useTaskFileUpload();
  const [requestId, setRequestId] = useState(() => createUuid());
  const [entries, setEntries] = useState<ComposerEntry[]>(() =>
    stored.map((file) =>
      isMessageDocument(file)
        ? {
            kind: 'document',
            key: file.id,
            name: file.name,
            size: file.size,
            document: file,
          }
        : {
            kind: 'image',
            key: file.id,
            name: file.name,
            preview: taskImageSrc(file.ref),
            image: { id: file.id, name: file.name, ref: file.ref },
          },
    ),
  );
  const [problem, setProblem] = useState('');
  const entriesRef = useRef(entries);
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);
  const change = (next: ComposerEntry[]) => {
    entriesRef.current = next;
    if (!activeRef.current) return;
    setEntries(next);
    store(next.flatMap((e) => storedOf(e) ?? []));
  };
  function add(files: File[]) {
    const problems: string[] = [];
    for (const file of files) {
      const why = messageFileProblem(file, entriesRef.current.length, max);
      if (why) {
        if (!problems.includes(why)) problems.push(why);
        continue;
      }
      const key = createUuid(),
        image = messageFileKind(file.name, file.type)?.kind === 'image',
        preview = image ? URL.createObjectURL(file) : '';
      change([
        ...entriesRef.current,
        image
          ? { kind: 'image', key, name: file.name, preview }
          : { kind: 'document', key, name: file.name, size: file.size },
      ]);
      upload(file, requestId).then(
        (done) => {
          if (!entriesRef.current.some((e) => e.key === key)) {
            void discard(done);
            return;
          }
          const { id, name, ref } = done;
          change(
            entriesRef.current.map((e) =>
              e.key !== key
                ? e
                : e.kind === 'image'
                  ? { ...e, image: { id, name, ref } }
                  : { ...e, document: done },
            ),
          );
        },
        (failure: unknown) => {
          if (preview) URL.revokeObjectURL(preview);
          change(entriesRef.current.filter((e) => e.key !== key));
          // A document the server read and refused says why, as New task does.
          const reason =
            failure instanceof MediaError ? failure.reason : undefined;
          if (activeRef.current)
            setProblem(
              $t(
                reason === 'TASK_MEDIA_TEXT_ENCODING'
                  ? 'taskFiles.textEncoding'
                  : reason === 'TASK_MEDIA_LEGACY_FORMAT'
                    ? 'taskFiles.legacyFormat'
                    : 'taskImages.uploadFailed',
                { 0: file.name },
              ),
            );
        },
      );
    }
    setProblem(problems.join(' '));
  }
  const release = (entry: ComposerEntry) => {
    if (entry.kind === 'image' && entry.preview.startsWith('blob:'))
      URL.revokeObjectURL(entry.preview);
  };
  function remove(key: string) {
    const entry = entriesRef.current.find((e) => e.key === key);
    if (!entry) return;
    release(entry);
    const file = storedOf(entry);
    if (file) void discard(file);
    change(entriesRef.current.filter((e) => e.key !== key));
  }
  /** After sending: the files are the task's now, and the next message starts empty. */
  function sent() {
    entriesRef.current.forEach(release);
    change([]);
    setProblem('');
    setRequestId(createUuid());
  }
  const images = entries.filter(
    (e): e is { kind: 'image' } & ComposerImage => e.kind === 'image',
  );
  const documents = entries.filter(
    (e): e is { kind: 'document' } & ComposerDocument => e.kind === 'document',
  );
  return {
    images,
    documents,
    /** Images and documents together, which the message's limit counts. */
    count: entries.length,
    problem,
    uploading: entries.some((e) => !storedOf(e)),
    /** What the message sends: `imageIds`, numbered as added, and `documentIds` when it has documents. */
    payload: (): { imageIds?: string[]; documentIds?: string[] } => {
      const imageIds = images.flatMap((e) => (e.image ? [e.image.id] : [])),
        documentIds = documents.flatMap((e) =>
          e.document ? [e.document.id] : [],
        );
      return {
        ...(imageIds.length ? { imageIds } : {}),
        ...(documentIds.length ? { documentIds } : {}),
      };
    },
    add,
    remove,
    sent,
    onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(event.clipboardData.files ?? []);
      if (!files.length) return;
      // A screenshot or a copied file pastes as a file, not its name as well; copied text that also carries an image
      // stays text as well.
      const text = event.clipboardData.getData('text/plain'),
        names = files.map((f) => f.name);
      if (
        !text ||
        text
          .split(/[\r\n]+/)
          .filter((line) => line.trim())
          .every((line) => names.includes(line.trim()))
      )
        event.preventDefault();
      add(files);
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      add(Array.from(event.dataTransfer.files));
    },
  };
}

/** Where each task image the person sent came from: the message or change request, its day and its number. */
export function imageSources(data: TaskData) {
  const out = new Map<
    string,
    { at: string; number: number; request: boolean }
  >();
  for (const e of data.work?.history || [])
    if (
      (e.action === 'comment' || e.action === 'requestStageChanges') &&
      Array.isArray(e.images)
    )
      e.images.forEach((image, i) => {
        if (!out.has(image.id))
          out.set(image.id, {
            at: e.at,
            number: i + 1,
            request: e.action === 'requestStageChanges',
          });
      });
  return out;
}

/**
 * The line under a new image in the review (never published): where it came from and whether it replaced an image
 * the article had.
 */
export function imageNote(
  source: { at: string; number: number; request: boolean } | undefined,
  replaced: boolean,
) {
  const suffix = replaced ? 'Replaced' : '';
  if (!source) return $t(`taskImages.note${suffix || 'New'}`);
  const day = formatDate(source.at);
  return $t(
    `taskImages.note${source.request ? 'Request' : 'Message'}${suffix}`,
    { 0: day, 1: source.number },
  );
}

const escapeAlt = (text: string) => text.replace(/[[\]\\]/g, '\\$&');
/** A file's name without its extension: an image's default description. */
const stem = (name: string) =>
  name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;

/**
 * Images pasted or dropped into a Markdown field, as GitHub's editor does (2026-11-03 user request): each goes in at
 * the cursor on a line of its own as `![Uploading name…]()` and becomes `![name](task image path)` once uploaded; the
 * name can then be edited as the image's description. An image whose placeholder was deleted meanwhile is discarded.
 * `bind` gives a field's textarea its handlers, called with the field's current value each render.
 */
export function usePastedImages() {
  const upload = useImageUpload();
  const [pending, setPending] = useState(0);
  const [problem, setProblem] = useState('');
  const fieldsRef = useRef(
    new Map<string, { value: string; set: (value: string) => void }>(),
  );
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);
  function insert(key: string, box: HTMLTextAreaElement, files: File[]) {
    const problems: string[] = [];
    const accepted = files.filter((file) => {
      const why = imageProblem(file, 0, Infinity);
      if (why && !problems.includes(why)) problems.push(why);
      return !why;
    });
    setProblem(problems.join(' '));
    const field = fieldsRef.current.get(key);
    if (!field || !accepted.length) return;
    const marks = accepted.map(
      (file) =>
        `![${escapeAlt($t('taskImages.uploadingMark', { 0: file.name }))}]()`,
    );
    const before = field.value.slice(0, box.selectionStart),
      after = field.value.slice(box.selectionEnd);
    const lead =
        !before || before.endsWith('\n\n')
          ? ''
          : before.endsWith('\n')
            ? '\n'
            : '\n\n',
      trail =
        !after || after.startsWith('\n\n')
          ? ''
          : after.startsWith('\n')
            ? '\n'
            : '\n\n';
    const text = `${lead}${marks.join('\n\n')}${trail}`,
      caret = before.length + lead.length + marks.join('\n\n').length;
    const replace = (from: string, to: string) => {
      const current = fieldsRef.current.get(key);
      if (!activeRef.current || !current?.value.includes(from)) return false;
      current.value = current.value.replace(from, to);
      current.set(current.value);
      return true;
    };
    field.value = `${before}${text}${after}`;
    field.set(field.value);
    requestAnimationFrame(() => box.setSelectionRange(caret, caret));
    accepted.forEach((file, i) => {
      setPending((n) => n + 1);
      upload(file, createUuid())
        .then(
          (image) => {
            if (
              !replace(
                marks[i],
                `![${escapeAlt(stem(file.name))}](${image.ref})`,
              )
            )
              void discard(image);
          },
          () => {
            replace(marks[i], '');
            if (activeRef.current)
              setProblem($t('taskImages.uploadFailed', { 0: file.name }));
          },
        )
        .finally(() => {
          if (activeRef.current) setPending((n) => n - 1);
        });
    });
  }
  const imageFiles = (list: FileList) =>
    Array.from(list).filter((f) => f.type.startsWith('image/'));
  return {
    uploading: pending > 0,
    problem,
    bind(key: string, value: string, set: (value: string) => void) {
      fieldsRef.current.set(key, { value, set });
      return {
        onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
          const files = imageFiles(event.clipboardData.files);
          if (!files.length) return;
          event.preventDefault();
          insert(key, event.currentTarget, files);
        },
        onDragOver(event: DragEvent<HTMLTextAreaElement>) {
          if (event.dataTransfer.types.includes('Files'))
            event.preventDefault();
        },
        onDrop(event: DragEvent<HTMLTextAreaElement>) {
          const files = Array.from(event.dataTransfer.files);
          if (!files.length) return;
          event.preventDefault();
          insert(key, event.currentTarget, files);
        },
        /** Images picked with the editor's image button. */
        onImages(box: HTMLTextAreaElement, files: File[]) {
          insert(key, box, files);
        },
      };
    },
  };
}

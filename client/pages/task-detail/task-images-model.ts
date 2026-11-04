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
  type TaskMediaView,
} from '../../../shared/manual-task.js';
import {
  isTaskImageType,
  taskImageOf,
  taskImageRef,
  type MessageImage,
} from '../../../shared/task-images.js';
import type { TaskData } from '../task-execution-types';

// Images on a started task (2026-11-03 user request): added to a message or change request in Activity, or pasted
// into Edit directly. They upload as the person adds them and are linked to the task when the message is sent or the
// edit saved; an article shows one by its task media path, which publishing replaces with the target's address.
// The parts that show them are in task-images.tsx.

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

/** Why a picked file was not added: the type, the size or the message's limit. */
export function imageProblem(file: File, count: number, max: number) {
  if (!isTaskImageType(file.type))
    return $t('taskImages.typeRejected', { 0: file.name });
  if (file.size > TASK_MEDIA_LIMIT)
    return $t('taskImages.tooLarge', { 0: file.name });
  if (count >= max) return $t('taskImages.tooMany', { 0: max });
  return '';
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
  if (!response.ok)
    throw new Error(`Task media request failed: ${response.status}`);
  return response;
}

/** Upload one image for the task; the server keeps it unlinked until a message or an edit uses it. */
export function useImageUpload() {
  const scope = useContext(TaskImageContext);
  return async (file: File, requestId: string): Promise<MessageImage> => {
    if (!scope) throw new Error('Task images need the task page.');
    const body = new FormData();
    body.set('file', file);
    const query = new URLSearchParams({
      projectId: String(scope.projectId),
      requestId,
      taskId: scope.taskId,
    });
    const { data } = (await (
      await media(`?${query}`, { method: 'POST', body })
    ).json()) as { data: TaskMediaView };
    // The stored file's address without the application's base path: what a message and an article keep.
    const stored = taskImageOf(data.contentUrl);
    return {
      id: data.id,
      name: data.filename,
      ref: taskImageRef(data.id, stored?.ext),
    };
  };
}

/** Discard an image the person removed before sending; it was never linked. */
const discard = (image: MessageImage) =>
  media(`/${encodeURIComponent(image.id)}`, { method: 'DELETE' }).catch(
    () => undefined,
  );

/** The images a message's draft keeps (JSON), or none when it holds anything else. */
export function readImages(stored: string): MessageImage[] {
  if (!stored) return [];
  try {
    const value: unknown = JSON.parse(stored);
    return Array.isArray(value)
      ? value.filter(
          (i): i is MessageImage =>
            Boolean(i) &&
            typeof (i as MessageImage).id === 'string' &&
            typeof (i as MessageImage).name === 'string' &&
            typeof (i as MessageImage).ref === 'string',
        )
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

/**
 * The images a message to the Agent or a change request may carry, as Activity's message box adds them: by paste,
 * drop or Add image, uploaded at once and sent with the message. `stored` keeps the uploaded ones with the message's
 * draft, so leaving the page and coming back keeps them.
 */
export function useComposerImages({
  stored,
  store,
  max,
}: {
  stored: MessageImage[];
  store: (images: MessageImage[]) => void;
  max: number;
}) {
  const upload = useImageUpload();
  const [requestId, setRequestId] = useState(() => createUuid());
  const [entries, setEntries] = useState<ComposerImage[]>(() =>
    stored.map((image) => ({
      key: image.id,
      name: image.name,
      preview: taskImageSrc(image.ref),
      image,
    })),
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
  const change = (next: ComposerImage[]) => {
    entriesRef.current = next;
    if (!activeRef.current) return;
    setEntries(next);
    store(next.flatMap((e) => (e.image ? [e.image] : [])));
  };
  function add(files: File[]) {
    const problems: string[] = [];
    for (const file of files) {
      const why = imageProblem(file, entriesRef.current.length, max);
      if (why) {
        if (!problems.includes(why)) problems.push(why);
        continue;
      }
      const key = createUuid(),
        preview = URL.createObjectURL(file);
      change([...entriesRef.current, { key, name: file.name, preview }]);
      upload(file, requestId).then(
        (image) => {
          if (!entriesRef.current.some((e) => e.key === key)) {
            void discard(image);
            return;
          }
          change(
            entriesRef.current.map((e) =>
              e.key === key ? { ...e, image } : e,
            ),
          );
        },
        () => {
          URL.revokeObjectURL(preview);
          change(entriesRef.current.filter((e) => e.key !== key));
          if (activeRef.current)
            setProblem($t('taskImages.uploadFailed', { 0: file.name }));
        },
      );
    }
    setProblem(problems.join(' '));
  }
  const release = (entry: ComposerImage) => {
    if (entry.preview.startsWith('blob:')) URL.revokeObjectURL(entry.preview);
  };
  function remove(key: string) {
    const entry = entriesRef.current.find((e) => e.key === key);
    if (!entry) return;
    release(entry);
    if (entry.image) void discard(entry.image);
    change(entriesRef.current.filter((e) => e.key !== key));
  }
  /** After sending: the images are the task's now, and the next message starts empty. */
  function sent() {
    entriesRef.current.forEach(release);
    change([]);
    setProblem('');
    setRequestId(createUuid());
  }
  const imageFiles = (list: FileList | null | undefined) =>
    Array.from(list ?? []).filter(
      (f) => f.type.startsWith('image/') || !f.type,
    );
  return {
    entries,
    problem,
    uploading: entries.some((e) => !e.image),
    ids: entries.flatMap((e) => (e.image ? [e.image.id] : [])),
    add,
    remove,
    sent,
    onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = imageFiles(event.clipboardData.files);
      if (!files.length) return;
      // A screenshot pastes as an image; copied text that also carries an image stays text as well.
      if (!event.clipboardData.getData('text/plain')) event.preventDefault();
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

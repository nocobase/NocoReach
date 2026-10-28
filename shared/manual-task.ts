import { z } from 'zod';

export const TASK_MEDIA_LIMIT = 20 * 1024 * 1024;
/** Images, videos and documents together, per task (2026-10-27: documents joined the five media files). */
export const TASK_MEDIA_COUNT = 10;
export const TASK_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
] as const;
/**
 * Documents by extension: browsers report no or different types for some (Markdown, CSV), so the extension decides
 * and the server checks the content. Macro-enabled and legacy binary Office formats are refused.
 */
export const TASK_DOCUMENT_TYPES = {
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
} as const;
export const TASK_LEGACY_DOCUMENTS = [
  '.doc',
  '.docm',
  '.xls',
  '.xlsm',
] as const;
export const TASK_FILE_TYPES = [
  ...TASK_MEDIA_TYPES,
  TASK_DOCUMENT_TYPES['.docx'],
  TASK_DOCUMENT_TYPES['.xlsx'],
  TASK_DOCUMENT_TYPES['.pdf'],
  TASK_DOCUMENT_TYPES['.csv'],
  TASK_DOCUMENT_TYPES['.md'],
  TASK_DOCUMENT_TYPES['.txt'],
] as const;
export type TaskFileType = (typeof TASK_FILE_TYPES)[number];
/** What the file picker offers: the media types and the document extensions. */
export const TASK_FILE_ACCEPT = [
  ...TASK_MEDIA_TYPES,
  ...Object.keys(TASK_DOCUMENT_TYPES),
].join(',');
const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
};
/**
 * The stored type of a picked file: its media type, a document type by extension, `legacy` for a format to save
 * again as .docx or .xlsx, or null when it is not taken.
 */
export function taskFileType(
  name: string,
  type: string,
): TaskFileType | 'legacy' | null {
  const extension = extensionOf(name);
  if (TASK_LEGACY_DOCUMENTS.some((legacy) => legacy === extension))
    return 'legacy';
  if (extension in TASK_DOCUMENT_TYPES)
    return TASK_DOCUMENT_TYPES[extension as keyof typeof TASK_DOCUMENT_TYPES];
  return TASK_MEDIA_TYPES.find((media) => media === type) ?? null;
}
export const isTaskDocument = (type: string) =>
  Object.values(TASK_DOCUMENT_TYPES).some((document) => document === type);

export const TASK_WHY_MAX = 300;
export const ManualTaskInput = z
  .strictObject({
    projectId: z.string().regex(/^[1-9]\d{0,15}$/),
    requestId: z.uuid(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(30000),
    /** One or two plain sentences for the task page's Why card; stored as `evidence.why`. */
    why: z.string().trim().min(1).max(TASK_WHY_MAX).optional(),
    playbookId: z
      .string()
      .regex(/^[a-z0-9-]{1,60}$/)
      .optional(),
    attachmentIds: z.array(z.uuid()).max(TASK_MEDIA_COUNT).default([]),
  })
  .refine(
    (value) => new Set(value.attachmentIds).size === value.attachmentIds.length,
    {
      path: ['attachmentIds'],
      message: 'Attachment IDs must be unique.',
    },
  );

export type ManualTaskInput = z.infer<typeof ManualTaskInput>;

export const ManualTaskView = z.object({
  id: z.string(),
  number: z.string(),
  projectId: z.string(),
  title: z.string(),
  brief: z.string(),
  status: z.string(),
  source: z.literal('manual'),
  attachmentIds: z.array(z.string()),
});
export type ManualTaskView = z.infer<typeof ManualTaskView>;

/** New task › Organize with AI: the rough idea a person wrote, to be turned into an editable draft. */
export const TASK_DRAFT_IDEA_MAX = 2000;
export const ManualTaskDraftInput = z.strictObject({
  projectId: z.string().regex(/^[1-9]\d{0,15}$/),
  idea: z.string().trim().min(1).max(TASK_DRAFT_IDEA_MAX),
  /** The draft the files were uploaded to, and the documents among them to read; media are not read. */
  requestId: z.uuid().optional(),
  attachmentIds: z.array(z.uuid()).max(TASK_MEDIA_COUNT).default([]),
});
export type ManualTaskDraftInput = z.infer<typeof ManualTaskDraftInput>;

/** A draft is never saved: the person edits it and creates the task with `ManualTaskInput`. */
export const ManualTaskDraft = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(30000),
  /** Why the work matters in one or two sentences; empty when the answer gave nothing usable. */
  why: z.string().max(TASK_WHY_MAX),
  playbookId: z.string().nullable(),
});
export type ManualTaskDraft = z.infer<typeof ManualTaskDraft>;
export const ManualTaskDraftView = ManualTaskDraft.extend({
  /** The project's playbooks, for the Suggested playbook select; `system` names are built-in text to translate. */
  playbooks: z.array(
    z.object({ id: z.string(), name: z.string(), system: z.boolean() }),
  ),
});
export type ManualTaskDraftView = z.infer<typeof ManualTaskDraftView>;

export const TaskMediaView = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.enum(TASK_FILE_TYPES),
  size: z.number(),
  contentUrl: z.string(),
});
export type TaskMediaView = z.infer<typeof TaskMediaView>;

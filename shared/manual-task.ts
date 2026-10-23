import { z } from 'zod';

export const TASK_MEDIA_LIMIT = 20 * 1024 * 1024;
export const TASK_MEDIA_COUNT = 5;
export const TASK_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
] as const;

export const ManualTaskInput = z
  .strictObject({
    projectId: z.string().regex(/^[1-9]\d{0,15}$/),
    requestId: z.uuid(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(30000),
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
});
export type ManualTaskDraftInput = z.infer<typeof ManualTaskDraftInput>;

/** A draft is never saved: the person edits it and creates the task with `ManualTaskInput`. */
export const ManualTaskDraft = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(30000),
  playbookId: z.string().nullable(),
});
export type ManualTaskDraft = z.infer<typeof ManualTaskDraft>;
export const ManualTaskDraftView = ManualTaskDraft.extend({
  /** The project's playbooks, for the Suggested playbook select. */
  playbooks: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type ManualTaskDraftView = z.infer<typeof ManualTaskDraftView>;

export const TaskMediaView = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.enum(TASK_MEDIA_TYPES),
  size: z.number(),
  contentUrl: z.string(),
});
export type TaskMediaView = z.infer<typeof TaskMediaView>;

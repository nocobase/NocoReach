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

export const TaskMediaView = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.enum(TASK_MEDIA_TYPES),
  size: z.number(),
  contentUrl: z.string(),
});
export type TaskMediaView = z.infer<typeof TaskMediaView>;

import { z } from 'zod';

export const TaskAgentDataQuery = z.strictObject({
  offset: z.coerce.number().int().min(0).max(10000000).default(0),
  limit: z.coerce.number().int().min(1000).max(30000).default(16000),
  section: z
    .enum([
      'context',
      'metrics',
      'keywords',
      'pages',
      'audit',
      'knowledge',
      'skills',
      'sources',
      'draft',
      'result',
    ])
    .default('context'),
});
export const TaskAgentData = z.object({
  projectId: z.string(),
  taskId: z.string(),
  runId: z.string(),
  section: z.string(),
  value: z.unknown(),
  page: z
    .object({
      format: z.literal('json'),
      text: z.string(),
      offset: z.number(),
      nextOffset: z.number().nullable(),
      totalCharacters: z.number(),
    })
    .nullable(),
});
export const TaskAgentDraftInput = z.strictObject({
  content: z.string().trim().min(1).max(30000),
});
export const TaskAgentDraft = z.object({
  runId: z.string(),
  savedAt: z.string(),
  submitted: z.literal(false),
});

export const TaskAgentResultInput = z.strictObject({
  content: z.string().min(1).max(100000),
});
export const TaskAgentResult = z.object({
  runId: z.string(),
  savedAt: z.string(),
  submitted: z.literal(true),
});

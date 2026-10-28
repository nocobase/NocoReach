import { z } from 'zod';
import { validRange } from 'semver';

const safePath = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[\w.@/-]+$/)
  .refine(
    (s) =>
      !s.startsWith('/') &&
      !s.split('/').some((x) => !x || x === '.' || x === '..'),
  );
const owner = z
  .string()
  .trim()
  .regex(/^[\w.-]{1,100}$/);
const repository = z
  .string()
  .trim()
  .regex(/^[\w.-]+\/[\w.-]+$/)
  .max(200);
export const ruleSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9-]{0,60}$/),
    name: z.string().trim().min(1).max(100),
    enabled: z.boolean(),
    queries: z
      .array(
        z.object({
          kind: z.enum(['repositories', 'code']),
          query: z.string().trim().min(1).max(200),
        }),
      )
      .min(1)
      .max(5),
    dependencies: z
      .array(
        z.object({
          name: z
            .string()
            .regex(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/)
            .max(150),
          range: z
            .string()
            .trim()
            .max(100)
            .refine((s) => !!s && !!validRange(s, { includePrerelease: true })),
        }),
      )
      .max(5),
    files: z
      .array(z.object({ path: safePath, contains: z.string().max(200) }))
      .max(5),
    json: z
      .array(
        z.object({
          path: safePath,
          field: z
            .string()
            .regex(/^[\w.-]+$/)
            .max(120)
            .refine(
              (s) =>
                !s
                  .split('.')
                  .some((x) =>
                    ['__proto__', 'constructor', 'prototype'].includes(x),
                  ),
            ),
          equals: z.string().max(200),
        }),
      )
      .max(5),
    excludeOwners: z.array(owner).max(30),
    excludeRepositories: z.array(repository).max(50),
    includeForks: z.boolean(),
    includeArchived: z.boolean(),
    includeTemplates: z.boolean(),
    intervalHours: z.union([z.literal(24), z.literal(168)]),
    batchSize: z.number().int().min(5).max(50),
  })
  .strict();

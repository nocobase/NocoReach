import { systemMessageText } from '../../shared/i18n/messages.js';
import { z } from 'zod';
const projectSchema = z.string().regex(/^[1-9]\d{0,15}$/);
export const browserCollectorSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/),
    name: z.string().trim().min(1).max(80),
    url: z.string().refine((value) => {
      try {
        const u = new URL(value);
        return (
          !u.username &&
          !u.password &&
          !u.search &&
          !u.hash &&
          (u.protocol === 'https:' ||
            (u.protocol === 'http:' &&
              ['127.0.0.1', '[::1]'].includes(u.hostname)))
        );
      } catch {
        return false;
      }
    }),
    platforms: z.array(z.enum(['xiaohongshu', 'bilibili'])).min(1),
    token: z
      .string()
      .min(32)
      .max(256)
      .regex(/^[\x21-\x7e]+$/),
    projectIds: z.array(projectSchema).min(1).optional(),
  })
  .strict();
export type BrowserCollectorConfig = z.infer<typeof browserCollectorSchema>;
export function parseBrowserCollectors(
  value: unknown,
): BrowserCollectorConfig[] {
  const parsed = z
    .array(browserCollectorSchema)
    .max(20)
    .safeParse(value ?? []);
  if (
    !parsed.success ||
    new Set(parsed.data.map((c) => c.id)).size !== parsed.data.length
  )
    throw new Error(
      systemMessageText('browserCollectorConfig.invalidDeployment'),
    );
  return parsed.data;
}

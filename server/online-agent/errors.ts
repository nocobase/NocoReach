import type { z } from 'zod';

export class OnlineAgentError extends Error {
  constructor(
    readonly code: string,
    readonly status = 409,
  ) {
    super(code);
  }
}

/**
 * Tool arguments that failed the tool's schema. The executor tells the model which field broke which rule, so it can
 * fix the call instead of guessing; every other tool failure stays generic.
 */
export class ToolInputError extends Error {}

/** A schema's issues as the model reads them: `field: rule` for the first few, shortened. */
export function inputIssues(error: z.ZodError) {
  const issues = error.issues
    .slice(0, 5)
    .map(
      (issue) =>
        `${issue.path.map(String).join('.') || 'input'}: ${issue.message.slice(0, 200)}`,
    );
  const more = error.issues.length - issues.length;
  return `${issues.join('; ')}${more > 0 ? `; and ${more} more` : ''}`;
}

/** A tool's arguments parsed with its schema; on failure, a `ToolInputError` naming the fields to fix. */
export function toolInput<T extends z.ZodType>(
  schema: T,
  args: unknown,
): z.output<T> {
  const parsed = schema.safeParse(args);
  if (parsed.success) return parsed.data;
  throw new ToolInputError(
    `Invalid input: ${inputIssues(parsed.error)}. Fix these fields and call the tool again.`,
  );
}

// The gateway's `ModelError` codes. `config` is the only one that is about the model's configuration.
const MODEL_ERRORS: Record<string, string> = {
  config: 'modelUnavailable',
  auth: 'modelAuth',
  quota: 'modelQuota',
  rateLimit: 'modelRateLimit',
  network: 'modelNetwork',
  contextOverflow: 'contextLimit',
  filtered: 'filtered',
  badResponse: 'modelRejected',
};
// A socket, DNS or database connection that failed on NocoReach's side rather than the model's.
const UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ECONNABORTED',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'SQLITE_BUSY',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_CLOSED',
]);
function unavailable(error: unknown) {
  for (
    let current = error, depth = 0;
    current instanceof Error && depth < 5;
    current = current.cause, depth++
  ) {
    const code = (current as Error & { code?: unknown }).code;
    if (
      (typeof code === 'string' && UNAVAILABLE_CODES.has(code)) ||
      /Connection|Timeout/.test(current.name) ||
      current.message === 'fetch failed'
    )
      return true;
  }
  return false;
}

/**
 * Persist safe codes only, never provider exception text or credentials. While NocoReach is stopping, whatever broke
 * the reply is the restart's doing; an error nothing explains is `unknown`, not the model's configuration.
 */
export function onlineErrorCode(error: unknown, stopping = false): string {
  if (error instanceof OnlineAgentError) return error.code;
  if (stopping) return 'interrupted';
  if (error instanceof Error && error.name === 'ModelError')
    return (
      MODEL_ERRORS[(error as Error & { code: string }).code] ??
      (unavailable(error.cause) ? 'modelNetwork' : 'unknown')
    );
  return unavailable(error) ? 'serviceUnavailable' : 'unknown';
}

export class OnlineAgentError extends Error {
  constructor(
    readonly code: string,
    readonly status = 409,
  ) {
    super(code);
  }
}

/** Persist safe codes only, never provider exception text or credentials. */
export function onlineErrorCode(error: unknown): string {
  if (error instanceof OnlineAgentError) return error.code;
  const code =
    error instanceof Error && error.name === 'ModelError'
      ? (error as Error & { code: string }).code
      : '';
  return (
    (
      {
        config: 'modelUnavailable',
        auth: 'modelAuth',
        quota: 'modelQuota',
        rateLimit: 'modelRateLimit',
        network: 'modelNetwork',
        contextOverflow: 'contextLimit',
        filtered: 'filtered',
      } as Record<string, string>
    )[code] || 'modelFailed'
  );
}

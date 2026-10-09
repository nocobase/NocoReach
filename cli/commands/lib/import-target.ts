// The NocoReach `app import-classic` imports into, reached over HTTP: its `nrImport` actions
// (server/nocoreach/classic-import.ts), called with an API key of a root user of that application.
export class ImportTargetError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class ImportTarget {
  readonly base: string;

  constructor(
    url: string,
    private readonly apiKey: string,
  ) {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:')
      throw new Error('the target must be an http(s) address');
    u.search = '';
    u.hash = '';
    this.base = u.toString().replace(/\/+$/, '');
  }

  /** The target's origin: where Google sends the browser back after consent. */
  get origin() {
    return new URL(this.base).origin;
  }

  async call<T>(action: string, body: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.base}/api/nocoreach/nrImport/${action}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });
    } catch (error) {
      throw new ImportTargetError(
        `连不上 ${this.base}：${(error as Error).message}`,
        0,
      );
    }
    const text = await response.text();
    let json: { data?: T; error?: { message?: string } } = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      /* not JSON: a proxy's page */
    }
    if (!response.ok) {
      const message =
        json.error?.message || text.slice(0, 200) || response.statusText;
      throw new ImportTargetError(message, response.status);
    }
    return json.data as T;
  }
}

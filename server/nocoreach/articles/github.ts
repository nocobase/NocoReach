import {
  ArticleError,
  field,
  scalar,
  unreachable,
  type Fetcher,
} from './provider.js';

const API = 'https://api.github.com';
export type GitFile = { path: string; sha: string; text: string };
export type GitCommit = { sha: string; name: string; email: string };
export type GitWrite = { path: string; content: string };

/** The few GitHub REST calls article publishing needs. The token stays on the server. */
export class GitHubFiles {
  constructor(
    private readonly repo: string,
    private readonly token: string | undefined,
    private readonly fetcher: Fetcher,
  ) {}
  private async call(
    path: string,
    init: RequestInit = {},
    missing = false,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(`${API}/repos/${this.repo}${path}`, {
        ...init,
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      throw unreachable(
        init.method && init.method !== 'GET'
          ? 'unknown_outcome'
          : 'unavailable',
        error,
        'github',
      );
    }
    if (missing && response.status === 404) return null;
    const body: unknown = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403)
      throw new ArticleError('unauthorized', 'github');
    if (response.status === 404) throw new ArticleError('not_found', 'github');
    if (response.status === 409 || response.status === 422)
      throw new ArticleError(
        'conflict',
        String((body as { message?: string })?.message || 'github').slice(
          0,
          200,
        ),
      );
    if (!response.ok)
      throw new ArticleError('unavailable', `github:${response.status}`);
    return body;
  }
  private enc = (p: string) => p.split('/').map(encodeURIComponent).join('/');
  async head(branch: string): Promise<string> {
    const ref = (await this.call(`/git/ref/heads/${this.enc(branch)}`)) as {
      object?: { sha?: string };
    };
    if (!ref?.object?.sha) throw new ArticleError('unavailable', 'github_ref');
    return ref.object.sha;
  }
  async file(path: string, ref: string): Promise<GitFile | null> {
    const body = (await this.call(
      `/contents/${this.enc(path)}?ref=${encodeURIComponent(ref)}`,
      {},
      true,
    )) as {
      type?: string;
      sha?: string;
      content?: string;
      encoding?: string;
    } | null;
    if (!body) return null;
    if (body.type !== 'file' || !body.sha)
      throw new ArticleError('invalid', `not_a_file:${path}`);
    // Files over 1 MB come without content; read their blob.
    let content = body.encoding === 'base64' ? body.content || '' : '';
    if (!content)
      content =
        ((await this.call(`/git/blobs/${body.sha}`)) as { content?: string })
          ?.content || '';
    return {
      path,
      sha: body.sha,
      text: Buffer.from(content, 'base64').toString('utf8'),
    };
  }
  async list(dir: string, ref: string): Promise<string[]> {
    const body = await this.call(
      `/contents/${this.enc(dir)}?ref=${encodeURIComponent(ref)}`,
      {},
      true,
    );
    return Array.isArray(body)
      ? body
          .filter(
            (x) => field(x, 'type') === 'dir' || field(x, 'type') === 'file',
          )
          .map((x) => scalar(field(x, 'name')))
      : [];
  }
  async lastCommit(path: string, ref: string): Promise<GitCommit | null> {
    const body = await this.call(
      `/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(ref)}&per_page=1`,
    );
    const c: unknown = Array.isArray(body) ? body[0] : null,
      author = field(field(c, 'commit'), 'author');
    return scalar(field(c, 'sha'))
      ? {
          sha: scalar(field(c, 'sha')),
          name: scalar(field(author, 'name')),
          email: scalar(field(author, 'email')),
        }
      : null;
  }
  /**
   * One commit on top of `parent`, then a fast-forward-only ref update: GitHub refuses it when the branch moved, so a
   * write never lands on a head it was not checked against. Returns null when the branch moved.
   */
  async commit(
    branch: string,
    parent: string,
    files: GitWrite[],
    message: string,
    author?: { name: string; email: string },
  ) {
    const base = (await this.call(`/git/commits/${parent}`)) as {
      tree?: { sha?: string };
    };
    const tree = (await this.call('/git/trees', {
      method: 'POST',
      body: JSON.stringify({
        base_tree: base?.tree?.sha,
        tree: files.map((f) => ({
          path: f.path,
          mode: '100644',
          type: 'blob',
          content: f.content,
        })),
      }),
    })) as { sha: string };
    const commit = (await this.call('/git/commits', {
      method: 'POST',
      body: JSON.stringify({
        message,
        tree: tree.sha,
        parents: [parent],
        ...(author ? { author, committer: author } : {}),
      }),
    })) as { sha: string };
    try {
      await this.call(`/git/refs/heads/${this.enc(branch)}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
    } catch (error) {
      if (error instanceof ArticleError && error.code === 'conflict')
        return null;
      throw error;
    }
    return commit.sha;
  }
}

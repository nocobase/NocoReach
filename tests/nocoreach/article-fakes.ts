import { createHash } from 'node:crypto';

// In-memory stand-ins for the systems article publishing talks to. They implement only the requests the providers
// send, with the behavior that matters for conflicts: NocoBase writes blindly, the article API checks baseVersion,
// GitHub refuses a non-fast-forward ref update.

type Init = RequestInit & { headers?: Record<string, string> };
const ok = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export function fakeNocoBase(rows: Record<string, unknown>[] = []) {
  const state = { rows: rows.map((r) => ({ ...r })), requests: [] as { method: string; action: string; params: URLSearchParams; body?: Record<string, unknown> }[], seq: 1000, clock: 0, failNextWrite: '' as '' | 'timeout' | '500-after-save' };
  const stamp = () => new Date(Date.UTC(2026, 9, 18, 0, 0, ++state.clock)).toISOString();
  const fetcher = async (url: string, init: Init) => {
    const u = new URL(url);
    if (init.headers?.Authorization !== 'Bearer cms-key') return ok({ errors: [{ message: 'Unauthorized' }] }, 401);
    const action = u.pathname.split(':')[1],
      body = init.body ? JSON.parse(String(init.body)) : undefined;
    state.requests.push({ method: String(init.method), action, params: u.searchParams, body });
    const byId = (id: string | null) => state.rows.find((r) => String(r.id) === id);
    if (action === 'get') {
      const row = byId(u.searchParams.get('filterByTk'));
      return row ? ok({ data: row }) : ok({ data: null });
    }
    if (action === 'list') {
      const filter = JSON.parse(u.searchParams.get('filter') || '{}');
      let out = state.rows;
      if (filter.slug?.$eq) out = out.filter((r) => r.slug === filter.slug.$eq);
      if (filter.$or) {
        const q = filter.$or[0].slug.$includes;
        out = out.filter((r) => String(r.slug).includes(q) || String(r.title).includes(q));
      }
      return ok({ data: out.slice(0, Number(u.searchParams.get('pageSize') || 20)) });
    }
    const failure = state.failNextWrite;
    state.failNextWrite = '';
    if (failure === 'timeout') throw new Error('socket hang up');
    if (action === 'create') {
      const row = { id: state.seq++, ...body, createdAt: stamp(), updatedAt: stamp() };
      state.rows.push(row);
      return failure === '500-after-save' ? ok({ errors: [{ message: 'boom' }] }, 500) : ok({ data: row });
    }
    if (action === 'update') {
      const row = byId(u.searchParams.get('filterByTk'));
      if (!row) return ok({ errors: [{ message: 'not found' }] }, 404);
      Object.assign(row, body, { updatedAt: stamp() });
      return failure === '500-after-save' ? ok({ errors: [{ message: 'boom' }] }, 500) : ok({ data: [row] });
    }
    return ok({ errors: [{ message: 'unknown' }] }, 404);
  };
  /** Someone saving in the CMS pages: a write that does not check any version. */
  const edit = (id: number, values: Record<string, unknown>) => Object.assign(state.rows.find((r) => r.id === id)!, values, { updatedAt: stamp() });
  return { state, fetcher, edit };
}

export function fakeArticleApi() {
  type A = { id: string; slug: string; status: string; version: string; locales: Record<string, Record<string, string>> };
  const state = { articles: [] as A[], keys: new Map<string, A>(), requests: [] as { method: string; path: string; key?: string; body?: Record<string, unknown> }[], v: 0 };
  const fetcher = async (url: string, init: Init) => {
    const u = new URL(url),
      path = u.pathname.replace(/^\/api/, '');
    if (init.headers?.Authorization !== 'Bearer api-key') return ok({ error: { code: 'unauthorized' } }, 401);
    const body = init.body ? JSON.parse(String(init.body)) : undefined,
      key = init.headers?.['Idempotency-Key'];
    state.requests.push({ method: String(init.method), path, key, body });
    if (init.method === 'GET' && path === '/articles') {
      const slug = u.searchParams.get('slug'),
        q = u.searchParams.get('q') || '';
      const hits = state.articles.filter((a) => (slug ? a.slug === slug : a.slug.includes(q)));
      return ok({ data: hits.map((a) => ({ id: a.id, slug: a.slug, title: a.locales.en?.title || '', status: a.status })) });
    }
    const m = /^\/articles\/(.+)$/.exec(path);
    if (init.method === 'GET' && m) {
      const a = state.articles.find((x) => x.id === decodeURIComponent(m[1]));
      return a ? ok({ data: a }) : ok({ error: { code: 'not_found' } }, 404);
    }
    if (key && state.keys.has(key)) return ok({ data: state.keys.get(key) });
    if (init.method === 'POST' && path === '/articles') {
      if (state.articles.some((a) => a.slug === body.slug)) return ok({ error: { code: 'slug_taken' } }, 409);
      const a = { id: `a${state.articles.length + 1}`, slug: body.slug, status: body.status || 'draft', version: `v${++state.v}`, locales: body.locales };
      state.articles.push(a);
      state.keys.set(key!, a);
      return ok({ data: a }, 201);
    }
    if (init.method === 'PATCH' && m) {
      const a = state.articles.find((x) => x.id === decodeURIComponent(m[1]));
      if (!a) return ok({ error: { code: 'not_found' } }, 404);
      if (body.baseVersion !== a.version) return ok({ error: { code: 'version_conflict', current: a } }, 409);
      for (const [l, f] of Object.entries(body.locales as Record<string, Record<string, string>>)) a.locales[l] = { ...a.locales[l], ...f };
      if (body.status) a.status = body.status;
      a.version = `v${++state.v}`;
      state.keys.set(key!, a);
      return ok({ data: a });
    }
    return ok({ error: { code: 'not_found' } }, 404);
  };
  return { state, fetcher };
}

const blob = (text: string) => {
  const buf = Buffer.from(text);
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
};
type Commit = { sha: string; parent: string | null; files: Map<string, string>; author: { name: string; email: string } };

export function fakeGitHub(repo: string, files: Record<string, string> = {}, author = { name: 'Person', email: 'person@example.com' }) {
  const commits = new Map<string, Commit>();
  const pending = new Map<string, Map<string, string>>();
  let n = 0;
  const make = (parent: string | null, next: Map<string, string>, who: { name: string; email: string }) => {
    const sha = createHash('sha1').update(`c${++n}`).digest('hex');
    commits.set(sha, { sha, parent, files: next, author: who });
    return sha;
  };
  const state = { head: make(null, new Map(Object.entries(files)), author), writes: 0, beforeRef: undefined as undefined | (() => void) };
  /** A commit made by someone else (a person, or the CMS exporter). */
  const push = (changes: Record<string, string | null>, who = author) => {
    const next = new Map(commits.get(state.head)!.files);
    for (const [p, t] of Object.entries(changes)) if (t === null) next.delete(p);
    else next.set(p, t);
    state.head = make(state.head, next, who);
    return state.head;
  };
  const read = (path: string) => commits.get(state.head)!.files.get(path);
  const fetcher = async (url: string, init: Init) => {
    const u = new URL(url),
      prefix = `/repos/${repo}`;
    if (!u.pathname.startsWith(prefix)) return ok({ message: 'Not Found' }, 404);
    const path = decodeURIComponent(u.pathname.slice(prefix.length)),
      body = init.body ? JSON.parse(String(init.body)) : undefined,
      method = init.method || 'GET';
    if (method === 'GET' && path.startsWith('/git/ref/heads/')) return ok({ object: { sha: state.head } });
    if (method === 'GET' && path.startsWith('/contents/')) {
      const p = path.slice('/contents/'.length),
        c = commits.get(u.searchParams.get('ref')!)!;
      const text = c.files.get(p);
      if (text !== undefined) return ok({ type: 'file', sha: blob(text), encoding: 'base64', content: Buffer.from(text).toString('base64') });
      const names = new Set([...c.files.keys()].filter((k) => k.startsWith(`${p}/`)).map((k) => k.slice(p.length + 1).split('/')[0]));
      return names.size ? ok([...names].map((name) => ({ name, type: 'dir' }))) : ok({ message: 'Not Found' }, 404);
    }
    if (method === 'GET' && path === '/commits') {
      const p = u.searchParams.get('path')!;
      for (let c = commits.get(u.searchParams.get('sha')!); c; c = c.parent ? commits.get(c.parent) : undefined) {
        const parent = c.parent ? commits.get(c.parent) : undefined;
        if (c.files.get(p) !== parent?.files.get(p)) return ok([{ sha: c.sha, commit: { author: c.author } }]);
      }
      return ok([]);
    }
    if (method === 'GET' && path.startsWith('/git/commits/')) return ok({ tree: { sha: `tree-${path.split('/').pop()}` } });
    if (method === 'POST' && path === '/git/trees') {
      const base = commits.get(String(body.base_tree).replace('tree-', ''))!;
      const next = new Map(base.files);
      for (const e of body.tree) next.set(e.path, e.content);
      const id = `t${++n}`;
      pending.set(id, next);
      return ok({ sha: id }, 201);
    }
    if (method === 'POST' && path === '/git/commits') {
      const sha = make(body.parents[0], pending.get(body.tree)!, body.author || { name: 'NocoReach', email: 'bot@example.com' });
      return ok({ sha }, 201);
    }
    if (method === 'PATCH' && path.startsWith('/git/refs/heads/')) {
      state.beforeRef?.();
      state.beforeRef = undefined;
      const c = commits.get(body.sha)!;
      if (c.parent !== state.head && body.force !== true) return ok({ message: 'Update is not a fast forward' }, 422);
      state.head = body.sha;
      state.writes++;
      return ok({ object: { sha: body.sha } });
    }
    return ok({ message: 'Not Found' }, 404);
  };
  return { state, fetcher, push, read, commits };
}

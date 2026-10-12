import { systemMessageText } from '../../../shared/i18n/messages.js';
interface ForumPost {
  id: number;
  post_number: number;
  raw?: string;
  cooked?: string;
  created_at?: string;
}
interface TopicResponse {
  id?: string | number;
  title?: string;
  posts_count?: number;
  post_stream?: { stream?: number[]; posts?: ForumPost[] };
}
/** Stable UI code plus readable context for the Agent's immutable source snapshot. */
export interface MaterialNotice {
  code: string;
  params?: Record<string, number>;
  message: string;
}
/** Public topic contents, never credentials or the forum's user directory. */
export interface TopicMaterial {
  id: string;
  title: string;
  url: string;
  fetchedAt: string;
  complete: boolean;
  posts: {
    number: number;
    text: string;
    links: string[];
    createdAt: string | null;
  }[];
  missing: MaterialNotice[];
}

export function referencedTopics(input: unknown, origin: string): string[] {
  const ids = new Set<string>();
  // Inspect only the immutable task request, not unrelated project recommendations or tool output.
  const serialized = JSON.stringify(input);
  for (const match of serialized.matchAll(
    /https?:\/\/[^\s<>"\\\u3000-\u303f]+/g,
  )) {
    try {
      const url = new URL(match[0]);
      if (url.origin !== origin || url.username || url.password) continue;
      const id = url.pathname.match(
        /^\/t\/(?:[^/]+\/)?([1-9]\d*)(?:\/\d+)?\/?$/,
      )?.[1];
      if (id) ids.add(id);
    } catch {
      /* Not a URL in the supplied task. */
    }
  }
  return [...ids];
}

export async function readTopicMaterial(
  origin: string,
  id: string,
  json: (url: string) => Promise<unknown>,
  plain: (html: string) => string,
): Promise<TopicMaterial> {
  if (!/^[1-9]\d{0,15}$/.test(id)) throw new Error('Invalid topic id');
  const material: TopicMaterial = {
    id,
    title: '',
    url: `${origin}/t/${id}`,
    fetchedAt: new Date().toISOString(),
    complete: false,
    posts: [],
    missing: [],
  };
  try {
    const topic = (await json(`${origin}/t/${id}.json`)) as TopicResponse;
    if (String(topic.id) !== id) throw new Error('Unexpected topic');
    material.title = String(topic.title || '').slice(0, 300);
    const stream = (topic.post_stream?.stream || []) as unknown[];
    const posts = new Map<number, ForumPost>(
      (topic.post_stream?.posts || []).map((p: ForumPost) => [p.id, p]),
    );
    // Discourse may send only the first page. Fetch the remaining public posts, bounded to 100.
    const missing = stream
      .filter(
        (pid): pid is number =>
          Number.isSafeInteger(pid) && !posts.has(pid as number),
      )
      .slice(0, Math.max(0, 100 - posts.size));
    for (let start = 0; start < missing.length; start += 20) {
      const query = missing
        .slice(start, start + 20)
        .map((pid) => `post_ids[]=${pid}`)
        .join('&');
      try {
        const page = (await json(
          `${origin}/t/${id}/posts.json?${query}`,
        )) as TopicResponse;
        for (const post of page.post_stream?.posts || [])
          posts.set(post.id, post);
      } catch {
        material.missing.push({
          code: 'replies_unavailable',
          message: systemMessageText('taskDetail.someExistingRepliesNotRead'),
        });
        break;
      }
    }
    let budget = 80000;
    for (const post of [...posts.values()]
      .sort((a, b) => a.post_number - b.post_number)
      .slice(0, 100)) {
      const raw =
        typeof post.raw === 'string'
          ? post.raw
          : plain(String(post.cooked || ''));
      const text = raw.slice(0, Math.min(16000, budget));
      budget -= text.length;
      if (text.length < raw.length)
        material.missing.push({
          code: 'post_truncated',
          params: { post: post.post_number },
          message: systemMessageText('taskDetail.postTooLongTruncated', {
            0: post.post_number,
          }),
        });
      const links = [
        ...String(post.cooked || '').matchAll(/(?:href|src)=["']([^"']+)["']/g),
      ]
        .flatMap((m) => {
          try {
            const u = new URL(m[1], origin);
            return /^https?:$/.test(u.protocol) && !u.username && !u.password
              ? [u.href]
              : [];
          } catch {
            return [];
          }
        })
        .slice(0, 30);
      material.posts.push({
        number: post.post_number,
        text,
        links,
        createdAt: typeof post.created_at === 'string' ? post.created_at : null,
      });
      if (!budget) break;
    }
    const expected = Math.max(Number(topic.posts_count) || 0, stream.length);
    if (material.posts.length < expected)
      material.missing.push({
        code: 'posts_incomplete',
        params: { expected, provided: material.posts.length },
        message: systemMessageText('taskDetail.postsIncluded', {
          0: expected,
          1: material.posts.length,
        }),
      });
    if (!material.posts.some((p) => p.number === 1 && p.text.trim()))
      material.missing.push({
        code: 'original_unavailable',
        message: systemMessageText('taskDetail.originalPostNotRead'),
      });
    material.complete = material.missing.length === 0;
  } catch {
    material.missing.push({
      code: 'forum_unavailable',
      message: systemMessageText('taskDetail.forumContentNotReadCheck'),
    });
  }
  return material;
}

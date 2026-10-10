// @vitest-environment node
import { expect, it, vi } from 'vitest';
import {
  referencedTopics,
  readTopicMaterial,
} from '../../server/nocoreach/execution/community-materials';
const origin = 'https://forum.example.com';
const plain = (html: string) => html.replace(/<[^>]*>/g, '');
it('resolves only topic links on the configured forum, without accepting credentials or arbitrary destinations', () => {
  expect(
    referencedTopics(
      {
        brief: `${origin}/t/topic/14507\n${origin}/t/14507 ${origin}/t/topic/2/3 https://evil.test/t/5 https://user:pass@forum.example.com/t/6`,
      },
      origin,
    ),
  ).toEqual(['14507', '2']);
});
it('reads original post and remaining replies while dropping user identities', async () => {
  const json = vi
    .fn()
    .mockResolvedValueOnce({
      id: 7,
      title: 'Question',
      posts_count: 2,
      post_stream: {
        stream: [1, 2],
        posts: [
          {
            id: 1,
            post_number: 1,
            cooked: '<p>Question <a href="/guide">guide</a></p>',
            username: 'private-user',
            email: 'private@example.test',
          },
        ],
      },
    })
    .mockResolvedValueOnce({
      post_stream: {
        posts: [
          {
            id: 2,
            post_number: 2,
            cooked: '<p>Existing answer</p>',
            user_id: 3,
          },
        ],
      },
    });
  const source = await readTopicMaterial(origin, '7', json, plain);
  expect(source.complete).toBe(true);
  expect(source.posts).toEqual([
    {
      number: 1,
      text: 'Question guide',
      links: [origin + '/guide'],
      createdAt: null,
    },
    { number: 2, text: 'Existing answer', links: [], createdAt: null },
  ]);
  expect(json).toHaveBeenNthCalledWith(
    2,
    origin + '/t/7/posts.json?post_ids[]=2',
  );
  expect(JSON.stringify(source)).not.toContain('private');
});
it('reports incomplete sources rather than claiming that truncated or unreadable posts were checked', async () => {
  const json = vi.fn().mockResolvedValue({
    id: 7,
    posts_count: 105,
    post_stream: {
      posts: [{ id: 1, post_number: 1, raw: 'x'.repeat(18000) }],
    },
  });
  const source = await readTopicMaterial(origin, '7', json, plain);
  expect(source.complete).toBe(false);
  expect(source.posts[0].text).toHaveLength(16000);
  expect(source.missing).toHaveLength(2);
  expect(source.missing[0]).toMatchObject({
    code: 'post_truncated',
    params: { post: 1 },
  });
  expect(source.missing[1]).toMatchObject({
    code: 'posts_incomplete',
    params: { expected: 105, provided: 1 },
  });
  const failed = await readTopicMaterial(
    origin,
    '7',
    vi.fn().mockRejectedValue(Error('private connection credentials')),
    plain,
  );
  expect(failed.complete).toBe(false);
  expect(failed.posts).toEqual([]);
  expect(failed.missing[0].code).toBe('forum_unavailable');
  expect(JSON.stringify(failed.missing)).not.toContain('credentials');
});
it('preserves the original post if fetching later replies fails and labels the gap', async () => {
  const json = vi
    .fn()
    .mockResolvedValueOnce({
      id: 7,
      posts_count: 2,
      post_stream: {
        stream: [1, 2],
        posts: [{ id: 1, post_number: 1, raw: 'Original' }],
      },
    })
    .mockRejectedValueOnce(Error('network unavailable'));
  const source = await readTopicMaterial(origin, '7', json, plain);
  expect(source.posts[0].text).toBe('Original');
  expect(source.complete).toBe(false);
  expect(source.missing.map((notice) => notice.code)).toEqual([
    'replies_unavailable',
    'posts_incomplete',
  ]);
});

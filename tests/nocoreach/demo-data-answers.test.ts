// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { DemoModelRequest } from '@nocobase/app-plugin-demo-mode/server/tokens';
import { demoAnswers } from '../../server/nocoreach/demo-data/answers';

const request = (overrides: Partial<DemoModelRequest>): DemoModelRequest => ({
  model: 'demo-chat',
  system: '',
  messages: [],
  prompt: '',
  tools: [],
  toolResults: [],
  language: 'zh',
  ...overrides,
});

async function answer(input: DemoModelRequest) {
  const found = demoAnswers().find((candidate) => candidate.match(input));
  return found ? await found.reply(input) : undefined;
}

describe('demo model answers', () => {
  it('answers a business operation with the JSON it expects, in the project’s language', async () => {
    const prompt = `今天的信号：${JSON.stringify({
      evidence: {
        signals: {
          items: [
            {
              key: 's1',
              title: 'Docs clicks dropped',
              actionable: true,
              source: 'gsc',
            },
          ],
        },
      },
    })}`;
    const zh = JSON.parse(
      String(await answer(request({ tag: 'daily-report', prompt }))),
    ) as {
      insights: { title: string; signalIds: string[] }[];
      signalReviews: { key: string; verdict: string }[];
    };
    expect(zh.insights[0]).toMatchObject({ signalIds: ['s1'] });
    expect(zh.insights[0]!.title).toContain('跟进');
    expect(zh.signalReviews).toEqual([
      expect.objectContaining({ key: 's1', verdict: 'do' }),
    ]);

    const en = JSON.parse(
      String(
        await answer(
          request({
            tag: 'keyword-suggest',
            system:
              'x\n\nLanguage: write every text meant for people in English: titles',
            prompt: '{"pages":[{"url":"https://nocobase.example/docs"}]}',
          }),
        ),
      ),
    ) as { groups: { name: string; keywords: { page: string }[] }[] };
    expect(en.groups[0]!.name).toBe('Product and features');
    expect(en.groups[0]!.keywords[0]!.page).toBe(
      'https://nocobase.example/docs',
    );
  });

  it('reads tasks through the offered tool, then lists them as links', async () => {
    const tools = [{ name: 'task_list' }, { name: 'project_data' }];
    expect(await answer(request({ prompt: '我有哪些任务？', tools }))).toEqual({
      toolCalls: [
        { name: 'task_list', arguments: { scope: 'accessible', limit: 8 } },
      ],
    });
    const text = await answer(
      request({
        prompt: '我有哪些任务？',
        tools,
        toolResults: [
          {
            name: 'task_list',
            content: JSON.stringify({
              items: [
                {
                  title: '补齐 Docker 检查点',
                  url: '/main/actions/7',
                  state: 'doing',
                },
              ],
            }),
          },
        ],
      }),
    );
    expect(text).toContain('[补齐 Docker 检查点](/main/actions/7) · 进行中');
  });

  it('summarizes the collected search metrics it read', async () => {
    const metrics = JSON.stringify({
      availableThrough: '2026-10-17',
      keywords: {
        items: [
          {
            keyword: 'nocobase permissions',
            page: '/docs',
            clicks: 42,
            impressions: 900,
            position: 4.26,
          },
        ],
      },
    });
    const text = String(
      await answer(
        request({
          language: 'en',
          prompt: 'How is our search traffic?',
          tools: [{ name: 'project_data' }],
          toolResults: [
            {
              name: 'project_data',
              content: JSON.stringify({ text: metrics, nextOffset: null }),
            },
          ],
        }),
      ),
    );
    expect(text).toContain('through 2026-10-17');
    expect(text).toContain(
      '“nocobase permissions”: 42 clicks, 900 impressions, average position 4.3',
    );
  });

  it('leaves a question it has no script for to the plugin’s fallback', async () => {
    expect(await answer(request({ prompt: '你好' }))).toBeUndefined();
  });
});

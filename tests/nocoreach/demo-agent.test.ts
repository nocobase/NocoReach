// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  executeDemoAgent,
  pageText,
} from '../../server/nocoreach/demo-data/demo-agent';

const input = (
  language: 'zh-CN' | 'en-US',
  url = 'https://nocobase.example/docs/reporting',
) =>
  JSON.stringify({
    language,
    task: {
      title: 'Rewrite the reporting guide',
      brief: 'Readers cannot find the weekly report.',
    },
    stage: { name: 'Change', instruction: 'Improve the page.' },
    content: { url, title: 'Reporting' },
    data: [
      '数据截至 2026-10-17，来自 NocoReach 已同步的数据，只用于参考。',
      '搜索（近 28 天）：点击 776，曝光 14,384，点击率 5.4%，平均排名 7.0',
      '网站审计里这页的问题：内容很短；图片缺少说明（alt）',
    ].join('\n'),
    knowledge: [{ title: 'Writing rules' }, { title: 'Positioning' }],
  });

const page = async () => ({
  title: 'Build a reporting dashboard',
  text: 'Connect a data source and choose a chart.',
});

describe('demo Agent', () => {
  it('works through the task, the page, its data and the knowledge before submitting', async () => {
    const result = await executeDemoAgent(
      { projectId: '1', mode: 'build', input: input('zh-CN') },
      page,
    );
    const kinds = result.steps.map((step) =>
      step.type === 'toolUse' ? `${step.type}:${step.tool}` : step.type,
    );
    expect(kinds).toEqual([
      'status',
      'thinking',
      'toolUse:Bash',
      'toolResult',
      'thinking',
      'toolUse:WebFetch',
      'toolResult',
      'thinking',
      'toolUse:Bash',
      'toolResult',
      'thinking',
      'toolUse:Read',
      'toolResult',
      'thinking',
      'text',
      'toolUse:Write',
      'toolResult',
      'toolUse:Bash',
      'toolResult',
      'text',
      'usage',
    ]);
    const outputs = result.steps.map((step) =>
      String(step.output ?? step.content ?? ''),
    );
    expect(outputs.join('\n')).toContain('# Build a reporting dashboard');
    // The finding is the first real metric, not the summary's heading.
    const thought = result.steps
      .filter((step) => step.type === 'thinking')
      .at(-1)!.content!;
    expect(thought).toContain('点击 776');
    expect(thought).toContain('内容很短');
    expect(thought).not.toContain('数据截至');
    expect(result.content).toContain('修改草稿');
    expect(result.content).toContain('Writing rules');
    expect(result.usage.outputTokens).toBeGreaterThan(0);
    // Played back over tens of seconds, like a Runner's report.
    const total = result.steps.reduce((sum, step) => sum + step.pauseMs, 0);
    expect(total).toBeGreaterThan(20_000);
    expect(total).toBeLessThan(60_000);
  });

  it('writes a new page when the page does not exist yet, in the project language', async () => {
    const result = await executeDemoAgent(
      {
        projectId: '1',
        mode: 'plan',
        input: input('en-US', 'https://nocobase.example/docs/new'),
      },
      async () => 'missing',
    );
    const fetched = result.steps.find(
      (step) => step.type === 'toolResult' && step.tool === 'WebFetch',
    );
    expect(fetched?.output).toBe(
      'https://nocobase.example/docs/new returned 404: the page does not exist yet, so this draft writes it as a new page.',
    );
    expect(result.content).toMatch(/^# Analysis: Rewrite the reporting guide/u);
  });

  it('refuses publication modes', async () => {
    await expect(
      executeDemoAgent({ projectId: '1', mode: 'merge', input: '{}' }, page),
    ).rejects.toThrow();
  });

  it('reads the title and main text of a page', () => {
    expect(
      pageText(
        '<html><title> Docs </title><nav>Menu</nav><main><h1>Hello</h1><p>World &amp; more</p></main></html>',
      ),
    ).toEqual({ title: 'Docs', text: 'Hello World & more' });
  });
});

import { expect, test } from 'vitest';
import {
  firstSentence,
  whyText,
} from '../../client/pages/task-detail/evidence-model';
import type { TaskData } from '../../client/pages/task-execution-types';

const task = (evidence: Record<string, unknown>, brief = '') =>
  ({ task: { evidence, brief }, work: { note: '' } }) as unknown as TaskData;

// T-35 on Studio (2026-10-23): the Why card showed the objective with its label and list of links, cut mid-word.
test('the first sentence drops the objective label, links, list markers and Markdown', () => {
  expect(
    firstSentence(
      '行动目标：弄清这些项目为什么受关注，找出我们可以做的集成。\n- https://github.com/a/b\n- https://github.com/c/d',
    ),
  ).toBe('弄清这些项目为什么受关注，找出我们可以做的集成。');
  expect(
    firstSentence(
      'Goal: **Find out** why [these repositories](https://github.com/trending) draw attention. Then pick one.',
    ),
  ).toBe('Find out why these repositories draw attention.');
  expect(firstSentence('\n- \n1. Move /ja back to page one\n')).toBe(
    'Move /ja back to page one',
  );
  expect(firstSentence('https://example.com/only-a-link')).toBe('');
});

test('a long sentence ends at a word in Latin text and anywhere in Chinese', () => {
  expect(
    firstSentence(
      'Work out why these fast-growing open source repositories are getting attention this week and what integrations we could build',
    ),
  ).toBe(
    'Work out why these fast-growing open source repositories are getting attention…',
  );
  const chinese = firstSentence('很'.repeat(100));
  expect(chinese).toBe(`${'很'.repeat(80)}…`);
});

test('the Why card prefers the stored reason, then the opportunity reason, then the objective, then the brief', () => {
  const objective = '行动目标：恢复 /ja 首页的自然搜索点击量。补上缺的页面。';
  expect(
    whyText(
      task({
        why: '/ja 首页近 28 天点击下降 34%。',
        insight: { reason: 'Clicks fell' },
        objective,
      }),
    ),
  ).toMatchObject({ text: '/ja 首页近 28 天点击下降 34%。', from: 'why' });
  expect(
    whyText(task({ insight: { reason: '点击下降 34%' }, objective })),
  ).toMatchObject({ text: '点击下降 34%', from: 'why' });
  expect(whyText(task({ objective }, 'brief text'))).toMatchObject({
    text: '恢复 /ja 首页的自然搜索点击量。',
    from: 'objective',
  });
  expect(
    whyText(task({}, '行动目标：写一篇对比文章\n\n读者是开发者')),
  ).toMatchObject({ text: '写一篇对比文章', from: 'brief' });
  expect(whyText(task({}))).toMatchObject({ text: '', from: undefined });
});

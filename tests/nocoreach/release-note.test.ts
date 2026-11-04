import { expect, test } from 'vitest';
import {
  changeSentence,
  forRecord,
  languagesLine,
  releaseNote,
} from '../../server/nocoreach/execution/release-note.js';

// 2026-11-04 (T-33): a published article's record ended with the reviewer summary's "awaiting human review".
test('the record keeps what changed and drops the sentences about review', () => {
  expect(
    forRecord(
      '优化了英文标题、描述和选型内容，补充审批示例。保留原 slug 和其他语言，等待人工审核。',
    ),
  ).toBe('优化了英文标题、描述和选型内容，补充审批示例。');
  // Whole sentences go, never a clause, and lines stay lines; a question mark inside quotes ends nothing.
  expect(
    forRecord(
      '按你的意见重写了中文标题，改为“哪款更合适？”开头。\n正文新增 4 个常见问题；其余段落沿用原文。\n截图建议后续更新；英文、日文在审核通过后再同步，要等英文版改好后才见效。',
    ),
  ).toBe(
    '重写了中文标题，改为“哪款更合适？”开头。\n正文新增 4 个常见问题；其余段落沿用原文。',
  );
  expect(
    forRecord('只改了中文版标题和摘要。英文、日文待审核通过后在翻译阶段同步。'),
  ).toBe('只改了中文版标题和摘要。');
  expect(
    forRecord(
      'Per your feedback, rewrote the English title. Added a pricing table (e.g. for teams). Awaiting human review.',
    ),
  ).toBe('Rewrote the English title. Added a pricing table (e.g. for teams).');
  // A summary about approvals as a subject keeps it.
  expect(forRecord('新增审批流程和审核记录的截图。')).toBe(
    '新增审批流程和审核记录的截图。',
  );
  expect(forRecord('提交审核。')).toBe('');
  expect(forRecord(undefined)).toBe('');
});

test("a version's sentence is its release, else its summary for the record", () => {
  expect(
    changeSentence({
      release: '重写了英文标题和摘要。',
      summary: '按你的意见重写了标题，等待人工审核。',
    }),
  ).toBe('重写了英文标题和摘要。');
  expect(changeSentence({ summary: '重写了标题。等待人工审核。' })).toBe(
    '重写了标题。',
  );
  expect(
    changeSentence({ release: '等待人工审核。', summary: '重写了标题。' }),
  ).toBe('重写了标题。');
  expect(changeSentence(null)).toBe('');
});

test('the languages line names the languages in the project language', () => {
  expect(languagesLine('zh-CN', ['en', 'ja'], [])).toBe(
    '已在英语和日语版本中做了相同修改。',
  );
  expect(languagesLine('zh-CN', ['zh'], ['ja'])).toBe(
    '已在中文版本中做了相同修改。已翻译成日语。',
  );
  expect(languagesLine('en-US', [], ['zh', 'ja'])).toBe(
    'Translated into Chinese and Japanese.',
  );
  expect(languagesLine('en-US', ['zh'], ['ja'])).toBe(
    'Made the same changes in Chinese. Translated into Japanese.',
  );
  expect(languagesLine('en-US', [], [])).toBe('');
});

test("the owner's note wins; otherwise the change and the languages, else the title", () => {
  const parts = {
    change: '重写了标题。',
    languages: '已翻译成日语。',
    title: 'T',
  };
  expect(releaseNote({ ...parts, owner: '手写的说明' })).toBe('手写的说明');
  expect(releaseNote({ ...parts, owner: '  ' })).toBe(
    '重写了标题。\n已翻译成日语。',
  );
  expect(releaseNote({ ...parts, change: '' })).toBe('已翻译成日语。');
  expect(releaseNote({ change: '', languages: '', title: 'T' })).toBe('T');
});

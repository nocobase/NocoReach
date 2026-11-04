import { expect, it } from 'vitest';
import english from '../../shared/i18n/en.json';
import legacyKeys from '../../shared/i18n/legacy-keys.json';
import {
  systemMessageKey,
  systemMessageText,
} from '../../shared/i18n/messages.js';
import { SYSTEM_PLAYBOOKS, stagesFor } from '../../shared/playbook-catalog.js';
import { resultRules } from '../../server/nocoreach/execution/agent-result';
import {
  flowRunInput,
  stageInstruction,
} from '../../server/nocoreach/execution/flow';

// A playbook's change step writes to the website repository (mode build) or to an article in a CMS (mode article),
// by the task's delivery. Its built-in instructions say what to write in words that hold for both; each mode's rules
// add what the place needs (2026-11-04: Write blog post sent a NocoBase CMS article to the blog folder, T-62).

const changing = SYSTEM_PLAYBOOKS.filter((p) =>
  p.steps.some((s) => s.kind === 'change'),
);
const instructionsOf = (p: (typeof SYSTEM_PLAYBOOKS)[number]) =>
  p.steps.flatMap((s) => (s.instruction ? [s.instruction] : []));

it('no built-in instruction of a playbook that changes something names repository-only work', () => {
  expect(changing.map((p) => p.id)).toEqual([
    'new-doc',
    'blog-post',
    'release-notes',
    'optimize-page',
    'sync-translations',
    'tech-fix',
  ]);
  const wrong = changing.flatMap((p) =>
    instructionsOf(p).flatMap((stored) => {
      const key = systemMessageKey(stored);
      if (!key) return [stored];
      const en = english[key as keyof typeof english];
      return /folder|frontmatter|navigation|\bfiles?\b|pull request|\bPR\b/i.test(
        en,
      ) ||
        /目录|frontmatter|导航|文件|PR/.test(stored) ||
        // The repository is named only beside the article, as one of the two places.
        (/repository/i.test(en) && !/article/i.test(en)) ||
        (stored.includes('仓库') && !stored.includes('文章'))
        ? [key]
        : [];
    }),
  );
  expect(wrong).toEqual([]);
  expect(english['playbooks.writeBlogPostTaskBrief']).toBe(
    'Write a blog post from the task brief or outline, with its title, summary, address, and body, and link related docs. Follow the style and format of the existing posts.',
  );
});

it('the build rules carry a new page’s folder, frontmatter and navigation; the article rules do not', () => {
  const build = resultRules('build').join('\n'),
    article = resultRules('article').join('\n');
  expect(build).toContain(
    '新建页面（如博客文章、文档页面、发布说明）时，照仓库里同类页面的做法：放到它们所在的目录',
  );
  expect(build).toContain('frontmatter 里的标题、描述、日期和标签');
  expect(build).toContain('同类页面都列在导航里时，把新页面也加进导航');
  expect(article).not.toContain('frontmatter');
  expect(article).not.toContain('导航');
  expect(resultRules('plan').join('\n')).not.toContain('frontmatter');
});

// The old wording stays the alias of each reworded key, so tasks started under it are still recognized.
const OLD_BLOG_POST = Object.entries(legacyKeys).find(
  ([, key]) => key === 'playbooks.writeBlogPostTaskBrief',
)![0];

function started(
  origin: { id?: string; system?: boolean; edited?: boolean },
  instruction = OLD_BLOG_POST,
) {
  const p = SYSTEM_PLAYBOOKS.find((p) => p.id === 'blog-post')!;
  const stages = structuredClone(stagesFor(p));
  stages[0].instruction = instruction;
  return {
    flow: { id: p.id, name: p.name, version: p.version, stages, ...origin },
    playbook: { name: p.name },
    results: [],
    history: [],
  };
}
const sent = (w: ReturnType<typeof started>) =>
  (
    flowRunInput({}, { title: 'T', brief: 'B' }, w, 0, null, []) as {
      stage: { instruction: string };
    }
  ).stage.instruction;

it('a task started from the unedited built-in sends the instruction in its current wording, as View steps shows it', () => {
  expect(OLD_BLOG_POST).toContain('放到博客目录，补全 frontmatter');
  const current = systemMessageText('playbooks.writeBlogPostTaskBrief');
  expect(current).not.toBe(OLD_BLOG_POST);
  expect(sent(started({ system: true, edited: false }))).toBe(current);
  // Started after this change: the same text.
  expect(sent(started({ system: true, edited: false }, current))).toBe(current);
});

it.each([
  ['an edited copy', { system: true, edited: true }],
  ['a custom playbook', { id: 'custom-1', system: false, edited: false }],
  ['a snapshot without its origin', {}],
])('%s keeps the stored instruction', (_name, origin) => {
  expect(sent(started(origin))).toBe(OLD_BLOG_POST);
});

it('text the built-ins do not have stays as stored, even on a built-in snapshot', () => {
  const own = '按大纲写，结尾加上试用链接 {0}';
  expect(sent(started({ system: true, edited: false }, own))).toBe(own);
  // A system message that is not a step instruction is not one to replace.
  const name = systemMessageText('playbooks.writeBlogPost');
  expect(
    stageInstruction({ id: 'blog-post', system: true, edited: false }, name),
  ).toBe(name);
  expect(
    stageInstruction({ id: 'blog-post', system: true, edited: false }),
  ).toBe('');
});

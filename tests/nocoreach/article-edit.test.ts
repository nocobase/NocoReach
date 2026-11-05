import { afterEach, expect, test, vi } from 'vitest';
import { ARTICLE_LEASE_MS } from '../../shared/article-edit.js';
import { systemMessageText } from '../../shared/i18n/messages.js';
import { articleFixture, review, underReview } from './article-edit-fixture';

vi.setConfig({ testTimeout: 60000 });
afterEach(() => vi.useRealTimers());

const NAMES = { 1: 'Tester', 2: 'Member', 3: 'Second' };
const form = (body: string, title = '你好') => ({
  slug: 'hello',
  status: 'published',
  locales: {
    en: {
      title: 'Hello',
      description: 'Old summary',
      body: '# Hello\n\nEnglish body',
    },
    zh: { title, description: '旧摘要', body },
  },
});
function editor(f, artifactId: () => string) {
  return (op: string, body = {}, actor = '1') =>
    f.s.articleEditing.handle(
      '1',
      { projectId: '1', taskId: '1', op, artifactId: artifactId(), ...body },
      actor,
      NAMES[actor],
    );
}
const rows = (f, kind: string) =>
  f.state.nrSnapshots.filter((r) => r.key.startsWith(`nr-task-${kind}:1:1:`));

test('the review card keeps its changes without making a version: open, save, discard and release', async () => {
  const f = await articleFixture();
  const { v1 } = await underReview(f);
  const edit = editor(f, () => v1.id);
  const task = structuredClone(f.state.nrTasks[0]);
  const opened = await edit('open');
  expect(opened).toEqual({
    lease: { userId: '1', name: 'Tester', until: expect.any(String) },
    mine: true,
    draft: null,
  });
  expect(Date.parse(opened.lease.until) - Date.now()).toBeGreaterThan(
    ARTICLE_LEASE_MS - 5000,
  );
  const saved = await edit('save', {
    form: form('# 你好\n\n第一段，改过。\n\n第二段。\n\n第三段。'),
    ai: 1,
  });
  expect(saved).toMatchObject({
    mine: true,
    lease: { userId: '1' },
    draft: {
      artifactId: v1.id,
      ai: 1,
      savedBy: '1',
      savedByName: 'Tester',
      savedAt: expect.any(String),
      form: {
        locales: {
          zh: { body: '# 你好\n\n第一段，改过。\n\n第二段。\n\n第三段。' },
        },
      },
    },
  });
  // Not a version and not a change to the task: no revision, no Activity, the work untouched.
  expect(f.state.nrTasks[0]).toEqual(task);
  expect((await f.view()).artifacts.map((a) => a.version)).toEqual([1]);
  expect(rows(f, 'article-edit')).toHaveLength(1);
  // Opening again (the heartbeat) gives the kept changes back; a save without AI counts none.
  expect((await edit('open')).draft.form.locales.zh.body).toContain('改过');
  expect(
    (await edit('save', { form: form('# 你好\n\n别的。') })).draft.ai,
  ).toBe(0);
  // Discard drops the changes and keeps the lease; release lets go of it.
  expect(await edit('discard')).toMatchObject({ draft: null, mine: true });
  expect(rows(f, 'article-edit')).toHaveLength(0);
  expect(await edit('release')).toEqual({
    lease: null,
    mine: false,
    draft: null,
  });
  expect(rows(f, 'article-lease')).toHaveLength(0);
  expect(await edit('release')).toEqual({
    lease: null,
    mine: false,
    draft: null,
  });
  expect(f.state.nrTasks[0]).toEqual(task);
});

test('one person edits at a time: others see who, are refused until the lease runs out, then take it', async () => {
  const f = await articleFixture();
  const { v1 } = await underReview(f);
  const edit = editor(f, () => v1.id);
  await edit('save', { form: form('# 你好\n\n第一段，改过。') });
  // Another administrator sees the article held by the owner, with the owner's changes.
  const seen = await edit('open', {}, '3');
  expect(seen).toMatchObject({
    lease: { userId: '1', name: 'Tester' },
    mine: false,
  });
  expect(seen.draft.form.locales.zh.body).toContain('改过');
  const busy = {
    status: 409,
    message: systemMessageText('taskExecution.articleBeingEdited', {
      0: 'Tester',
    }),
  };
  await expect(
    edit('save', { form: form('# 你好\n\n抢着改。') }, '3'),
  ).rejects.toMatchObject(busy);
  await expect(edit('discard', {}, '3')).rejects.toMatchObject(busy);
  // Releasing someone else's lease does nothing.
  expect(await edit('release', {}, '3')).toMatchObject({
    lease: { userId: '1' },
    mine: false,
  });
  expect((await edit('open', {}, '3')).draft.form.locales.zh.body).toContain(
    '改过',
  );
  // The owner's lease lapses without a heartbeat; the other administrator saves and holds it now.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + ARTICLE_LEASE_MS + 1000);
  expect(await edit('open', {}, '3')).toMatchObject({
    lease: { userId: '3', name: 'Second' },
    mine: true,
  });
  const taken = await edit('save', { form: form('# 你好\n\n接着改。') }, '3');
  expect(taken).toMatchObject({
    lease: { userId: '3' },
    mine: true,
    draft: { savedBy: '3', savedByName: 'Second' },
  });
  await expect(
    edit('save', { form: form('# 你好\n\n回来了。') }),
  ).rejects.toMatchObject({
    status: 409,
    message: systemMessageText('taskExecution.articleBeingEdited', {
      0: 'Second',
    }),
  });
  // A heartbeat renews the holder's lease.
  vi.setSystemTime(Date.now() + ARTICLE_LEASE_MS - 1000);
  const renewed = await edit('open', {}, '3');
  expect(Date.parse(renewed.lease.until)).toBeGreaterThan(
    Date.parse(taken.lease.until),
  );
  vi.setSystemTime(Date.now() + 2000);
  expect(await edit('open')).toMatchObject({
    lease: { userId: '3' },
    mine: false,
  });
});

test('only the owner or an administrator edits, only the version under review, and only a valid form', async () => {
  const f = await articleFixture();
  const { v1, stageKey } = await underReview(f);
  let current = v1.id;
  const edit = editor(f, () => current);
  // A member who does not own the task reads it but cannot hold or change the article.
  const owner = {
    status: 403,
    message: systemMessageText('messages.reviewsTaskLeaveComment', {
      0: 'Tester',
    }),
  };
  await expect(edit('open', {}, '2')).rejects.toMatchObject(owner);
  await expect(
    edit('save', { form: form('# 你好\n\n成员改。') }, '2'),
  ).rejects.toMatchObject(owner);
  await expect(edit('discard', {}, '2')).rejects.toMatchObject(owner);
  expect(rows(f, 'article-lease')).toHaveLength(0);
  // Invalid requests.
  await expect(edit('save')).rejects.toMatchObject({ status: 400 });
  await expect(edit('lock')).rejects.toMatchObject({ status: 400 });
  await expect(
    edit('save', { form: { locales: { zh: { body: 'x', extra: 'y' } } } }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    edit('save', { form: form('x'), revision: 3 }),
  ).rejects.toMatchObject({ status: 400 });
  // Another version under review: the kept changes of the old one are refused, whoever saves.
  current = 'not-a-version';
  const stale = {
    status: 409,
    message: systemMessageText('taskExecution.articleVersionChanged'),
  };
  await expect(
    edit('save', { form: form('# 你好\n\n旧的。') }),
  ).rejects.toMatchObject(stale);
  current = v1.id;
  await edit('save', {
    form: form('# 你好\n\n第一段，改过。\n\n第二段。\n\n第三段。'),
  });
  await f.command('editArticleDraft', {
    stageKey,
    artifactId: v1.id,
    article: { locales: { zh: { body: '# 你好\n\n第二版。' } } },
  });
  await expect(
    edit('save', { form: form('# 你好\n\n旧的。') }),
  ).rejects.toMatchObject(stale);
  // Opening still answers, whatever version: the page compares the draft's version itself.
  expect(await edit('open')).toMatchObject({ mine: true, draft: null });
  // Past review (approved), nothing is kept.
  const d = await f.view();
  current = review(d).id;
  await f.command('approveStage', {
    stageKey,
    artifactId: current,
    checked: [],
  });
  await expect(
    edit('save', { form: form('# 你好\n\n批准后。') }),
  ).rejects.toMatchObject(stale);
});

test('a version saved from the review card counts AI and hand changes and takes the kept changes in', async () => {
  const f = await articleFixture();
  const { v1, stageKey } = await underReview(f);
  const edit = editor(f, () => v1.id);
  const body =
    '# 你好\n\n第一段，改过。\n\n第二段。\n\n第三段。\n\n新加的一段。';
  await edit('save', { form: form(body, '你好，世界'), ai: 1 });
  // Malformed counts are refused before anything changes.
  for (const edits of [{ ai: -1 }, { ai: 1.5 }, { ai: 1, hand: 3 }, 'one'])
    await expect(
      f.command('editArticleDraft', {
        stageKey,
        artifactId: v1.id,
        edits,
        article: { locales: { zh: { body } } },
      }),
    ).rejects.toMatchObject({ status: 400 });
  expect(rows(f, 'article-edit')).toHaveLength(1);
  let d = await f.command('editArticleDraft', {
    stageKey,
    artifactId: v1.id,
    edits: { ai: 1 },
    article: { locales: { zh: { title: '你好，世界', body } } },
  });
  // Three places: the title, the first paragraph and the one added at the end; AI rewrote one of them.
  const v2 = review(d);
  expect(v2).toMatchObject({ version: 2, edits: { ai: 1, hand: 2 } });
  expect((await f.view()).artifacts.find((a) => a.id === v2.id).edits).toEqual({
    ai: 1,
    hand: 2,
  });
  expect(rows(f, 'article-edit')).toHaveLength(0);
  expect(await edit('open')).toMatchObject({ draft: null });
  // Without a count from the page every changed place is the person's; AI never counts below zero hand changes.
  d = await f.command('editArticleDraft', {
    stageKey,
    artifactId: v2.id,
    article: {
      locales: {
        zh: {
          title: '你好，世界',
          body: body.replace('第二段。', '第二段，也改了。'),
        },
      },
    },
  });
  expect(review(d).edits).toEqual({ ai: 0, hand: 1 });
  d = await f.command('editArticleDraft', {
    stageKey,
    artifactId: review(d).id,
    edits: { ai: 5 },
    article: {
      locales: {
        zh: {
          title: '你好',
          body: body.replace('第二段。', '第二段，也改了。'),
        },
      },
    },
  });
  expect(review(d).edits).toEqual({ ai: 5, hand: 0 });
});

test('restoring a version clears the changes kept on the one it replaces', async () => {
  const f = await articleFixture();
  const { v1, stageKey } = await underReview(f);
  let d = await f.command('editArticleDraft', {
    stageKey,
    artifactId: v1.id,
    article: { locales: { zh: { body: '# 你好\n\n第二版。' } } },
  });
  const v2 = review(d);
  await editor(f, () => v2.id)('save', {
    form: form('# 你好\n\n第二版，又改了。'),
  });
  expect(rows(f, 'article-edit')).toHaveLength(1);
  d = await f.command('restoreArticleVersion', {
    stageKey,
    artifactId: v1.id,
    currentId: v2.id,
  });
  expect(review(d)).toMatchObject({
    version: 3,
    restoredFrom: { artifactId: v1.id },
  });
  expect(rows(f, 'article-edit')).toHaveLength(0);
});

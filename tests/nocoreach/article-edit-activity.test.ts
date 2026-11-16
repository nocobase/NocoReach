import { expect, test, vi } from 'vitest';
import { articleFixture, review, underReview } from './article-edit-fixture';

vi.setConfig({ testTimeout: 60000 });

// 2026-11-12 user report: changes made in the review card after version 4 showed nowhere in Activity. The task read
// says who saved changes not made a version yet and when, to everyone who reads the task, never the changes.

const NAMES = { 1: 'Tester', 2: 'Member', 3: 'Second' };
const form = (body: string) => ({
  slug: 'hello',
  status: 'published',
  locales: {
    en: {
      title: 'Hello',
      description: 'Old summary',
      body: '# Hello\n\nEnglish body',
    },
    zh: { title: '你好', description: '旧摘要', body },
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
// The task as a member who may read it but not edit it reads it.
const asMember = (f) =>
  f.s.get('1', '1', undefined, { userId: '2', seesMachines: false });

test('the task read names unversioned changes, without them, until they become a version or are discarded', async () => {
  const f = await articleFixture();
  const { v1, stageKey } = await underReview(f);
  let current = v1.id;
  const edit = editor(f, () => current);
  expect((await f.view()).unversionedEdits).toBeNull();

  await edit('save', { form: form('# 你好\n\n第一段，改过。'), ai: 2 }, '3');
  const read = await asMember(f);
  expect(read.unversionedEdits).toEqual({
    artifactId: v1.id,
    ai: 2,
    savedAt: expect.any(String),
    savedBy: '3',
    savedByName: 'Second',
  });
  expect(JSON.stringify(read)).not.toContain('改过');
  // The member still may not open the changes themselves.
  await expect(edit('open', {}, '2')).rejects.toMatchObject({ status: 403 });
  // A command's answer is the same task read.
  const commented = await f.command('comment', { comment: 'Looks good' });
  expect(commented.unversionedEdits).toMatchObject({ savedBy: '3', ai: 2 });

  // Made a version: the line becomes that version's.
  const d = await f.command(
    'editArticleDraft',
    {
      stageKey,
      artifactId: v1.id,
      article: { locales: { zh: { body: '# 你好\n\n第二版。' } } },
      edits: { ai: 2 },
    },
    '3',
  );
  expect(d.unversionedEdits).toBeNull();

  // Changes to the new version once Second has left, then discarded.
  current = review(d).id;
  await edit('release', {}, '3');
  await edit('save', { form: form('# 你好\n\n又改了。') });
  expect((await f.view()).unversionedEdits).toMatchObject({
    artifactId: current,
    savedBy: '1',
    savedByName: 'Tester',
    ai: 0,
  });
  await edit('discard');
  expect((await f.view()).unversionedEdits).toBeNull();
});

test('changes kept for another version, or on a closed task, are not named', async () => {
  const f = await articleFixture();
  const { v1 } = await underReview(f);
  const edit = editor(f, () => v1.id);
  await edit('save', { form: form('# 你好\n\n改过。') });
  const draft = f.state.nrSnapshots.find((r) =>
    r.key.startsWith('nr-task-article-edit:1:1:'),
  );
  expect(draft.payload.artifactId).toBe(v1.id);
  // Another version under review (as after the Agent's next run): the changes were made to the old one.
  draft.payload.artifactId = 'old-version';
  expect((await f.view()).unversionedEdits).toBeNull();
  await edit('save', { form: form('# 你好\n\n改过。') });
  expect((await f.view()).unversionedEdits).not.toBeNull();
  await f.command('cancelTask');
  expect((await f.view()).unversionedEdits).toBeNull();
});

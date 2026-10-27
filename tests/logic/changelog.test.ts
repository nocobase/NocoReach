// @vitest-environment node
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  NOTES,
  checkNote,
  fold,
  insertSections,
} from '../../scripts/fold-changelog.mjs';

const root = path.resolve(import.meta.dirname, '../..');

describe('changelog', () => {
  it('gains no Unreleased section in CHANGELOG.md', () => {
    const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    expect(
      changelog.match(/^## Unreleased\b.*$/gm) ?? [],
      `Record the change in ${NOTES}/<branch>.md instead, with "-" for "/" in the branch name; see ${NOTES}/README.md.`,
    ).toEqual([]);
  });

  it(`keeps each note in ${NOTES}/ to one section`, () => {
    const problems = readdirSync(path.join(root, NOTES))
      .filter((name) => name !== 'README.md')
      .flatMap((name) =>
        checkNote(name, readFileSync(path.join(root, NOTES, name), 'utf8')).map(
          (problem) => `${NOTES}/${name}: ${problem}`,
        ),
      );
    expect(problems, `See ${NOTES}/README.md.`).toEqual([]);
  });

  it('names what is wrong with a note', () => {
    expect(checkNote('feat-list-tags.md', '## Tags\n\n- A tag.\n')).toEqual([]);
    expect(checkNote('feat/list tags.txt', '## Tags\n\n- A tag.\n')).toEqual([
      'name it after the branch, with "-" for "/", ending in ".md"',
    ]);
    expect(checkNote('a.md', 'Tags\n\n- A tag.\n')).toEqual([
      'start with a "## " title',
    ]);
    expect(checkNote('a.md', '## Unreleased — Tags\n\n- A tag.\n')).toEqual([
      'leave "Unreleased" out of the title',
    ]);
    expect(checkNote('a.md', '## Tags\n\n- A.\n\n## More\n\n- B.\n')).toEqual([
      'keep to one "## " section',
    ]);
    expect(checkNote('a.md', '## Tags\n\nTags are shown.\n')).toEqual([
      'describe the change in "- " bullets',
    ]);
  });

  it('puts notes below the title and introduction, above the first section', () => {
    expect(
      insertSections('# Changelog\n\nNewest first.\n\n## Old\n\n- Old.\n', [
        '## Newer\n\n- Newer.\n',
        '\n## New\n\n- New.\n\n',
      ]),
    ).toBe(
      '# Changelog\n\nNewest first.\n\n## Newer\n\n- Newer.\n\n## New\n\n- New.\n\n## Old\n\n- Old.\n',
    );
    expect(insertSections('# Changelog\n', ['## New\n\n- New.\n'])).toBe(
      '# Changelog\n\n## New\n\n- New.\n',
    );
  });

  it('folds notes in by when they reached main, the latest first, and deletes them', () => {
    const repository = mkdtempSync(path.join(tmpdir(), 'nocoreach-changelog-'));
    try {
      const git = (args: string[], seconds = 1_800_000_000) =>
        execFileSync(
          'git',
          [
            '-c',
            'user.name=Test',
            '-c',
            'user.email=test@example.test',
            '-c',
            'commit.gpgsign=false',
            ...args,
          ],
          {
            cwd: repository,
            encoding: 'utf8',
            env: {
              ...process.env,
              GIT_AUTHOR_DATE: `@${seconds} +0000`,
              GIT_COMMITTER_DATE: `@${seconds} +0000`,
            },
          },
        );
      const note = (name: string) =>
        writeFileSync(
          path.join(repository, NOTES, `${name}.md`),
          `## ${name}\n\n- ${name}.\n`,
        );

      git(['init', '--quiet', '--initial-branch=main']);
      mkdirSync(path.join(repository, NOTES), { recursive: true });
      writeFileSync(path.join(repository, NOTES, 'README.md'), '# Notes\n');
      writeFileSync(
        path.join(repository, 'CHANGELOG.md'),
        '# Changelog\n\n## Old\n\n- Old.\n',
      );
      git(['add', '.']);
      git(['commit', '--quiet', '-m', 'Start']);

      // A branch's own commit is older than the squashed pull request after it, but it reaches main last.
      git(['checkout', '--quiet', '-b', 'merged']);
      note('merged');
      git(['add', '.']);
      git(['commit', '--quiet', '-m', 'Merged'], 1_800_000_100);
      git(['checkout', '--quiet', 'main']);
      note('squashed');
      git(['add', '.']);
      git(['commit', '--quiet', '-m', 'Squashed'], 1_800_000_200);
      git(
        ['merge', '--quiet', '--no-ff', '-m', 'Merge', 'merged'],
        1_800_000_300,
      );
      note('uncommitted');

      expect(fold(repository)).toEqual([
        'uncommitted.md',
        'merged.md',
        'squashed.md',
      ]);
      expect(readFileSync(path.join(repository, 'CHANGELOG.md'), 'utf8')).toBe(
        '# Changelog\n\n## uncommitted\n\n- uncommitted.\n\n## merged\n\n- merged.\n\n## squashed\n\n- squashed.\n\n## Old\n\n- Old.\n',
      );
      expect(readdirSync(path.join(repository, NOTES))).toEqual(['README.md']);
      expect(fold(repository)).toEqual([]);
    } finally {
      rmSync(repository, { recursive: true, force: true });
    }
  });

  it('folds nothing in while a note is malformed', () => {
    const repository = mkdtempSync(path.join(tmpdir(), 'nocoreach-changelog-'));
    try {
      mkdirSync(path.join(repository, NOTES), { recursive: true });
      writeFileSync(path.join(repository, 'CHANGELOG.md'), '# Changelog\n');
      writeFileSync(
        path.join(repository, NOTES, 'good.md'),
        '## Good\n\n- Good.\n',
      );
      writeFileSync(path.join(repository, NOTES, 'bad.md'), 'Bad.\n');
      expect(() => fold(repository)).toThrow(
        `${NOTES}/bad.md: start with a "## " title`,
      );
      expect(readFileSync(path.join(repository, 'CHANGELOG.md'), 'utf8')).toBe(
        '# Changelog\n',
      );
      expect(existsSync(path.join(repository, NOTES, 'good.md'))).toBe(true);
    } finally {
      rmSync(repository, { recursive: true, force: true });
    }
  });
});

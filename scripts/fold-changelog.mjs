// Moves the change notes in changelog/unreleased/ to the top of CHANGELOG.md, newest first, and deletes them.
// Pull requests add one note each instead of editing CHANGELOG.md, so no two of them change the same lines. Run this
// on a branch from main, in a pull request of its own, whenever the notes are worth folding in:
//
//   pnpm changelog:fold
//
// Notes are ordered by the commit that brought them into the branch's first-parent history (the squash or merge
// commit on main); notes not committed yet come first.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const NOTES = 'changelog/unreleased';
const README = 'README.md';

/** What is wrong with one note; an empty list means it can be folded in as it is. */
export function checkNote(name, text) {
  const problems = [];
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(name))
    problems.push(
      'name it after the branch, with "-" for "/", ending in ".md"',
    );
  const lines = text.trim().split('\n');
  if (!/^## \S/.test(lines[0])) problems.push('start with a "## " title');
  else if (/^## Unreleased\b/i.test(lines[0]))
    problems.push('leave "Unreleased" out of the title');
  if (lines.slice(1).some((line) => /^##? /.test(line)))
    problems.push('keep to one "## " section');
  if (!lines.some((line) => /^- \S/.test(line)))
    problems.push('describe the change in "- " bullets');
  return problems;
}

/** The changelog with the sections above its first "## " section, below its title and introduction. */
export function insertSections(changelog, sections) {
  const body = sections.map((section) => section.trim()).join('\n\n');
  const at = changelog.search(/^## /m);
  return at < 0
    ? `${changelog.trimEnd()}\n\n${body}\n`
    : `${changelog.slice(0, at)}${body}\n\n${changelog.slice(at)}`;
}

function landedAt(root, file) {
  // --first-parent also reads a merge commit's changes against its first parent, so a pull request merged without
  // squashing counts from its merge into main rather than from its own commit.
  try {
    const time = execFileSync(
      'git',
      [
        'log',
        '-1',
        '--first-parent',
        '--diff-filter=A',
        '--format=%ct',
        '--',
        file,
      ],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return time ? Number(time) : Infinity;
  } catch {
    return Infinity;
  }
}

export function fold(root) {
  const directory = join(root, NOTES);
  const notes = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== README)
    .map(({ name }) => ({
      name,
      text: readFileSync(join(directory, name), 'utf8'),
    }));
  const problems = notes.flatMap(({ name, text }) =>
    checkNote(name, text).map((problem) => `${NOTES}/${name}: ${problem}`),
  );
  if (problems.length) throw new Error(problems.join('\n'));
  if (!notes.length) return [];
  const order = new Map(
    notes.map(({ name }) => [name, landedAt(root, `${NOTES}/${name}`)]),
  );
  notes.sort(
    (a, b) =>
      order.get(b.name) - order.get(a.name) || a.name.localeCompare(b.name),
  );
  const changelog = join(root, 'CHANGELOG.md');
  writeFileSync(
    changelog,
    insertSections(
      readFileSync(changelog, 'utf8'),
      notes.map(({ text }) => text),
    ),
  );
  for (const { name } of notes) rmSync(join(directory, name));
  return notes.map(({ name }) => name);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const folded = fold(fileURLToPath(new URL('..', import.meta.url)));
    console.log(
      folded.length
        ? `Moved ${folded.length} ${folded.length === 1 ? 'note' : 'notes'} to CHANGELOG.md:\n${folded.map((name) => `  ${name}`).join('\n')}`
        : `No notes in ${NOTES}/.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

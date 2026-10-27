## Change notes in files of their own

- Pull requests record their change in `changelog/unreleased/<branch>.md` instead of adding a section at the top of CHANGELOG.md, so merging one no longer makes every other open pull request conflict there and need `main` merged in and CI run again. `pnpm changelog:fold` moves the notes into CHANGELOG.md, the latest merged first, and deletes them; `tests/logic/changelog.test.ts` checks the notes and fails when CHANGELOG.md gains an "Unreleased" section.
- CHANGELOG.md's sections drop "Unreleased" from their titles, since each was deployed to Studio when it merged; the untitled one is now "Earlier changes".

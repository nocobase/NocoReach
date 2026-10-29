# Change notes

A pull request records its change here instead of in [CHANGELOG.md](../../CHANGELOG.md): one file named after its branch, with `-` for `/` (`feat/list-tags` becomes `feat-list-tags.md`). Pull requests then never change the same lines, so merging one does not make the others conflict.

A note is one section, written in English as CHANGELOG.md's sections are, without "Unreleased" in the title:

```md
## Skills: the playbooks that use a Skill, as tags

- The Skill drawer lists the playbooks that use the Skill as tags, each opening its playbook.
```

`pnpm changelog:fold` moves the notes to the top of CHANGELOG.md, the latest merged first, and deletes them. The Release workflow does this automatically in its version commit and uses the same notes for the GitHub Release. To fold notes separately, run it on a branch from `main`, in a pull request of its own. `tests/logic/changelog.test.ts` checks each note's form and fails when CHANGELOG.md gains an "Unreleased" section.

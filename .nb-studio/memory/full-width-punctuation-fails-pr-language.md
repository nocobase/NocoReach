---
name: Full-width punctuation fails the PR language check
description: PR language treats full-width punctuation such as the colon U+FF1A as Chinese in every commit of the PR; a pushed commit cannot be fixed without a new branch
type: feedback
modified: 2026-11-07
---

Never quote stored Chinese strings, full-width colons or other CJK punctuation in commit messages, the PR title or its description; describe them in words ("a keyword that begins with a full-width colon").

**Why:** `.github/workflows/pr-language.yml` matches `　-〿` and `＀-￯` on each commit of the pull request. History is never rewritten, so one such commit forced closing PR #398 and later moving PR #399 to a new branch.

**How to apply:** Before `git commit`, check the message with the same pattern the workflow uses.

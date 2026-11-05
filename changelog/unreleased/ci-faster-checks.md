## CI: the same checks in a fraction of the time

- `pnpm test` runs on four machines with `--shard`, three workers each, instead of two workers on one. The slowest file, `tests/nocoreach/demo-data-app.test.ts`, ran its eight tests one after another for almost seven minutes; its lifecycle and conversation tests now live in `demo-data-lifecycle-app.test.ts` and `demo-data-conversations-app.test.ts`, which run beside it.
- The Database compatibility workflow is part of CI. Its SQLite leg repeated what `pnpm test` already runs on SQLite, so the `build` job now packs the release archive and runs `deployment-artifact.test.ts` on it instead. PostgreSQL and MySQL run their application, demo import and production artifact suites as six parallel jobs, each starting only its own database.
- A newer push to a pull request cancels its running checks; `main` no longer does, so every commit on `main` is checked to completion.
- Pull requests that change only documentation run the tests that read documentation instead of the full suite. `CI result` reports on every run and is the one check to require in branch protection.
- The Release workflow tests its version commit on the same four shards, builds it alongside, and publishes only after both pass.

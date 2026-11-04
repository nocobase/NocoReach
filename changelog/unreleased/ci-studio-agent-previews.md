## CI: previews come from Studio's agents; nothing here deploys to the test Studio

- Pull request previews are published by the agent working on the issue, with `nb-studio deploy --preview`, once the repository's check source in Studio is Agent self-check. The planned dedicated job in the unified CI, its acceptance scripts and runbook are removed.
- Remove the workflows that deployed `main` to the test Studio's `nocoreach` App and the demo to `nocoreach-demo`. Merging no longer updates `nocoreach`; deploy it with `nb-studio deploy` when it should move.
- `scripts/ci/deploy-studio.mjs` now deploys only the Solutions `reach` App on a verified release tag. The `tests`, `build`, `english`, database, Release and Solutions workflows are unchanged.

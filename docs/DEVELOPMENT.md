# NocoReach Development Constraints

This is the index of NocoReach's application rules. Like NocoCRM, shared rules live in `AGENTS.md` and topic-specific constraints live in `.agents/rules/`; read only the files relevant to the task. Follow the [application development Skill](../.agents/skills/nocobase-app-development/SKILL.md) and its references for general development; explicit application adaptations in the linked rules take precedence over template examples.

See the [changelog](../CHANGELOG.md), with the notes not yet folded into it in [changelog/unreleased/](../changelog/unreleased/README.md), and the [port plan](PORT-PLAN.md) for historical context. Legacy Agent and AI configuration, deployment steps, and outstanding items in the port plan reflect their time, not current implementation requirements. Dependency versions come from `package.json` and the lockfile.

## Frontend

[Frontend](../.agents/rules/nocoreach-frontend.md) — Pages, routes, copy, identity caches and themes.

## Backend and data

[Backend and data](../.agents/rules/nocoreach-server.md) — Business APIs, authorization, transactions, database compatibility, caches and demo data.

### Database compatibility

See [database conventions and verification](../.agents/rules/nocoreach-server.md#database-compatibility) and the deployment guides in [Chinese](DATABASE-DEPLOYMENT.zh-CN.md) or [English](DATABASE-DEPLOYMENT.md).

## Outbound networking

[Outbound networking](../.agents/rules/outbound-networking.md) — OAuth, proxies, collectors and public fetching.

## Task execution

[Task execution](../.agents/rules/task-execution.md) — Agents, Runners, task state, results, review and article publishing.

## Upgrades and releases

[Upgrades and releases](../.agents/rules/build-and-deploy.md) — Dependencies, upgrades, builds, deployments and CLI distribution.

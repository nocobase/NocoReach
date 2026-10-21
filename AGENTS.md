# NocoReach Agent Guide

- Reply in Chinese and write end-user documentation in Chinese.
- Write developer guidance, changelogs, PR titles and descriptions, commit messages and code comments in English. In comments, name interface elements by their English labels (Settings › Network, Keywords › Saved, Hand off to agent); older comments that still use Chinese names are not a pattern to copy. `tests/logic/comment-language.test.ts` fails when a file gains comments containing Chinese.
- This is a NocoBase 3 application. Use this repository's Skills, not globally installed NocoBase 2 Skills.
- Implement business features in application source. Create a plugin only when explicitly asked for a reusable, independently published package. Prefer registered plugins and existing mechanisms.

## Getting started

Install dependencies with `pnpm install`; start development with `pnpm dev`. Installation synchronizes `.agents/skills/`; run `pnpm nocobase skills sync` if missing or stale. Synchronized Skills, `.claude/skills/`, and database Collection caches are generated; do not edit them manually.

Before implementing features or fixes, read the [application development Skill](.agents/skills/nocobase-app-development/SKILL.md), then only the relevant references and plugin Skills. The following documents describe NocoReach's adaptations to the template; read only the sections affected by the task.

| Task                                                             | Project guidance                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| Pages, routes, copy, themes, identity caches                     | [Frontend](docs/DEVELOPMENT.md#frontend)                           |
| Business APIs, permissions, databases, sync, background services | [Backend and data](docs/DEVELOPMENT.md#backend-and-data)           |
| Data collection, OAuth, proxies, public fetching                 | [Outbound networking](docs/DEVELOPMENT.md#outbound-networking)     |
| Agents, Runners, task execution, results, review                 | [Task execution](docs/DEVELOPMENT.md#task-execution)               |
| Dependencies, upgrades, builds, deployment, CLI distribution     | [Upgrades and releases](docs/DEVELOPMENT.md#upgrades-and-releases) |

## Changes and validation

- Preserve business authorization, session isolation, and data boundaries. Frontend visibility does not replace server authorization.
- Follow nearby code organization and style. Avoid unrelated refactoring, formatting, or dependency upgrades.
- Validate changed code and affected callers. Scope formatting, lint, and tests to files; use the owning project configuration for type checks. Broaden checks only when the impact requires it; do not routinely run the aggregate `pnpm check`.
- Documentation changes need formatting and link checks only. Tests belong in `tests/`, with business tests in `tests/nocoreach/`; use `pnpm exec vitest run <test-file>` as needed. Report changes, checks performed, and unverified behavior.

## Maintaining this guidance

Keep this file limited to rules shared across tasks and pointers to further guidance. Update it only when those rules change, revising existing entries first. Maintain module constraints in the relevant topic, link to Skills for tutorials, and record significant changes in [CHANGELOG.md](CHANGELOG.md). Do not append version notes, debugging histories, or test logs here. `CLAUDE.md` only references this file.

Keep [development guidance](docs/DEVELOPMENT.md) in sync with code changes: capture confirmed, reusable lessons, revise or remove outdated rules, and maintain affected links. Prefer updating existing entries.

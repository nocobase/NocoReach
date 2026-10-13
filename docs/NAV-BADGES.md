# Navigation count contract

`nrStrategy/badges` returns `{ projectId: string, insights: number, opportunities: number, tasks: number }`. The existing action wrapper checks NocoReach membership and project existence. No new permission mechanism, migration, or persisted count is introduced.

- Insights counts the `TodayChanges` todo rows: `todaySuggestions(state, 50)` plus current signals not cited by those rows whose shared `signalDisposition` is pending opportunity or standalone `do`. Keep the existing v2/v3 selection and display bound. A cited opportunity counts once even with multiple signals. This excludes the personal task strip.
- Opportunities counts deduplicated `rowsFor(state)` with `opportunityState === pending`: latest analysis or restored history, excluding ignored and handed-off cards. `change === new` is not a filter.
- Tasks counts raw project task records using the home waiting strip's owner fallback and state: current user's todo/review, excluding archived/cancelled; ownerless records count for administrators. The task list and badge share `TaskService.tasks`, with complete 200-record pagination rather than silent 2000/5000-record caps.

Pure predicates and snapshot types live in `shared/strategy-pending.ts`, `shared/strategy-model.ts`, and `shared/task-pending.ts`. The existing client modules re-export their previous public names.

`NavBadgeProvider` is mounted beneath the session-keyed `MeProvider` and `WorkspaceCacheProvider`. It creates a fresh context per project. `useNavBadge('insights' | 'opportunities' | 'tasks')` returns `{ count: number | null, status: 'loading' | 'ready' | 'error', label: string }`. Only `ready` has an accurate count. A ready zero can hide the badge; loading/error must not be presented as zero. Invalid, missing, negative, fractional, or wrong-project responses fail closed.

The provider refreshes on navigation, focus, every minute, and `refreshNavBadges()`. Opportunity decisions, signal decisions/verdicts, analysis completion, handoffs, and task updates publish refresh events. Project/session changes clear state; unmounted or superseded requests cannot publish results. PM-311 owns menu route mapping, orange badge rendering, collapsed/mobile layout, and accessibility presentation.

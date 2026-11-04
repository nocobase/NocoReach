# Connection status measurements

Measure the catalog's data loader separately from drawer details, Data health, navigation badges and application startup. The old loader makes seventeen parallel business requests followed by the article-target request. The current loader makes one aggregate request; its first read runs the same eighteen actions in parallel.

Use an isolated application and the English NocoReach Demo Mode dataset, following [page loading measurements](PERFORMANCE.md). Build the production client before measuring. Keep the database, encryption environment, identity, project and source fixtures unchanged across versions. Preserve a dataset snapshot hash with the results; never export the database, authentication cookies or keys.

Compare the original eighteen-request sequence with `GET /nocoreachConnect/status` in at least five interleaved rounds. Record raw elapsed times with `performance.now()`, HTTP request counts, business-action invocations and SQL counts by operation, without SQL parameters. Report medians and ranges. In-process HTTP measurements isolate server handling and serialization; label them separately from network round trips and browser readiness.

Cover first load, a repeated read, expiry, twenty concurrent readers and a failed source. Age the internal cache timestamp for expiry rather than waiting ten minutes or changing the system clock. Hold status actions until stale responses finish to prove that they do not wait for refresh; release and drain the held work before the next measurement. For failure, first populate a successful copy, expire it, reject one source and confirm that its previous value remains while the other sources refresh. A fresh failure without a previous success returns null for that source.

Observe SQL through the isolated database driver's query event without recording bindings. Count background work separately from response latency: an expired response can finish before its refresh queries run. Cache hits still pay authentication, membership and per-source authorization costs; they execute no source status actions and introduce no database writes, transactions or locks. A cold aggregate and a refresh run at most eighteen status actions, shared by concurrent readers of the same identity and project. Independent identities retain independent caches.

After measuring, open the real catalog with the production client, check its connected cards and enabled actions, then repeatedly open and close a source drawer. Record aggregate requests separately from drawer details and health/badge requests. Capture English screenshots and browser errors. Use the automated connection-status cache/application tests for the 599-second hit, expiry, retry interval, invalidation races, session/project/key separation and denied item checks. Restore the clock, close the application and delete its isolated storage when finished.

## Ordinary member evidence

The 2026-11-04 run used application source `8833623b`, Node.js 24.22.2 and SQLite. The English Demo Mode dataset contained two projects, 86 tasks, 28 opportunities and 16 knowledge records. Administrator and member measurements alternated on the same database and project, with five rounds per identity/version/scenario (100 samples). The business snapshot hash remained `efc6af7615f1959c2bc11c22229bd08586bcd92b2e00e7135de12a7ab37aaf59` before and after all samples. Background business timers were held during measurement; the native authentication and HTTP handlers ran normally.

The newly created member signed in through native authentication, had the built-in `nr.member` permission set and membership in the selected project only, and was neither root nor an administrator. All eighteen source reads were explicitly allowed. A read on the other project and Google configuration were denied. This exercises successful member reads, rather than an outsider receiving eighteen denied results.

The table shows the member's observed counts. SQL totals include drained background refresh work; response SQL stops when the response finishes. The old loader has no background work. All samples performed zero request-attributed writes.

| Scenario                       | HTTP, old → aggregate | SQL at response, old → aggregate | Aggregate SQL including refresh | Source checks including refresh, old → aggregate |
| ------------------------------ | --------------------- | -------------------------------- | ------------------------------- | ------------------------------------------------ |
| First                          | 18 → 1                | 187 → 88                         | 88                              | 18 → 18                                          |
| Hit                            | 18 → 1                | 187 → 27                         | 27                              | 18 → 0                                           |
| Expired                        | 18 → 1                | 187 → 33                         | 88                              | 18 → 18                                          |
| Twenty concurrent cold readers | 360 → 20              | 3740–3741 → 601                  | 601                             | 360 → 18                                         |
| GitHub refresh failure         | 18 → 1                | 184 → 33                         | 85                              | 18 → 18                                          |

| Scenario                       | Old elapsed ms, median (range) | Aggregate elapsed ms, median (range) |
| ------------------------------ | ------------------------------ | ------------------------------------ |
| First                          | 91.49 (81.34–115.53)           | 36.52 (32.94–42.89)                  |
| Hit                            | 97.65 (82.76–123.38)           | 9.59 (8.84–10.99)                    |
| Expired                        | 95.88 (82.03–129.75)           | 12.80 (11.48–20.23)                  |
| Twenty concurrent cold readers | 1929.94 (1585.15–2092.68)      | 193.10 (181.87–218.65)               |
| GitHub refresh failure         | 96.46 (77.03–102.25)           | 14.79 (14.30–16.83)                  |

Elapsed times are in-process response times, excluding held refresh completion and real network latency. For member stale responses, four source invocations had started at response completion and eighteen completed after releasing the hold. GitHub failure preserved the successful cached object while other items refreshed. The failure total is three queries below a successful refresh because the injected GitHub failure happens before its data queries.

The same-run administrator hit used seven SQL queries and zero source checks: median 4.33 ms (3.96–6.98), versus the member's 27 queries. Keep these identities separate when reporting costs. The member still pays session, membership and eighteen per-item authorization checks on cache hits.

`tests/nocoreach/connection-status-member-app.test.ts` authenticates an ordinary member, requires eighteen non-null source results, and asserts that a warm read executes no source action or SQL writes. Its query ceiling is **32**, based on five observed 27-query hits plus five queries of framework metadata headroom. This catches redoing cold-source work (88 queries in this dataset) without tying the test to elapsed time. The isolated fixture uses actual source handlers and does not stub successful status results.

The raw `member-measurements.json` and executable `member-measure.mts` accompany the delivery record. The harness compares the original eighteen-request sequence with the aggregate handler, attributes queries through async request context, ages only internal cache timestamps, and releases and drains refreshes before the next sample. Runtime paths in the attached harness must be adjusted to the local checkout and output directory. This follow-up changes only tests and this record; it does not change the measured application implementation.

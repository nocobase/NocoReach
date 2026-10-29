# NocoReach demo reset resource evidence — 2026-10-29

## Three independent formal pairs complete

All three pairs in AB, BA, AB order pass the **predetermined comparison gate**:
at least 20% lower reset-window peak heap and RSS in each pair, with no regression
in command-lifetime OS RSS. Every process performs one warmup import and five
full resets. All changed processes pass the original full-application budgets;
all base processes complete five resets but later fail the separate annual-report
stress phase. The baseline is not reported as a passing full resource test.

Base is `f55023ac3b6e197a85d9bccb77f8146ddb27f643`, fetched from `origin/main`
at task start. Changed is the four application files in this branch. The same
worktree temporarily overlays only those files, preserving all other source,
dependencies and the harness. Exact source SHA-256 values identify each version
in the [raw formal archive](formal-measurements.tar.gz); HEAD alone cannot
identify an overlaid run. Both labels use the same published framework versions.

A final fetch before PR creation found `origin/main` at
`7bf65da831c67896f6148c7bbbbd8bfe31463dcd`, three commits after the measured base.
Those commits change release automation, the application version and Insights
overview windows; they do not change these four production files or the lockfile.
The measurements remain pinned to the stated base and this branch, not an
unmeasured merge or deployed revision.

## Full reset peaks

Each cell is **base / changed**, in MiB (1,048,576 bytes). Each process contributes
one peak: the largest observation across its five full reset windows. The five
rounds are repeated cycles, not five independent experiments.

| Pair/order | Reset peak heap | Heap reduction |  Reset peak RSS | RSS reduction | Whole-command OS RSS high-water |
| ---------- | --------------: | -------------: | --------------: | ------------: | ------------------------------: |
| 1 (AB)     | 1,240.1 / 503.3 |         59.41% | 1,537.8 / 773.9 |        49.68% |                 1,783.1 / 773.9 |
| 2 (BA)     | 1,234.4 / 501.7 |         59.36% | 1,454.6 / 752.0 |        48.30% |                 1,780.8 / 752.0 |
| 3 (AB)     | 1,241.3 / 506.4 |         59.21% | 1,490.1 / 779.2 |        47.71% |                 1,725.5 / 779.2 |

Across the three independently started pairs, heap reductions range from
**59.21% to 59.41%** and reset-window RSS reductions from
**47.71% to 49.68%**. Every pair passes the fixed gate; no
favorable round or earlier pilot substitutes for a failed observation. The
original one-pair [pilot](pilot.md) is separate and is not counted. The
[per-round CSV](formal-results.csv) contains all thirty formal reset observations,
including duration, observed heap, independent-thread RSS and post-GC retention.

**Whole-command OS high-water is not a reset-window metric.** It includes startup,
Vitest and the real application worker through exit, including the separate
annual-report phase. All three base processes complete five resets and then OOM
in annual-report stress. That later OOM inflates their command-lifetime high-water;
it is not used to calculate either reset peak reduction above.

## Timing and retained memory tradeoffs

| Pair | Reset median seconds, base / changed | Median change | Warmup seconds, base / changed | Post-reset-5 retained heap MiB, base / changed |
| ---- | -----------------------------------: | ------------: | -----------------------------: | ---------------------------------------------: |
| 1    |                      29.864 / 43.124 |       +44.40% |                32.680 / 36.506 |                                  671.8 / 181.3 |
| 2    |                      39.862 / 40.183 |        +0.80% |                46.424 / 38.534 |                                  671.3 / 181.5 |
| 3    |                      30.414 / 46.937 |       +54.32% |                32.701 / 56.223 |                                  671.6 / 181.4 |

Pairs 1 and 3 regress materially (+44.40% and +54.32%); pair 2 is also slightly slower (+0.80%).
Removing persistent fact and multi-day visit caches trades recomputation for
bounded memory. We retain every timing result and do not claim faster resets.
The initial pilot's faster reset median remains in its own report and is not
substituted for formal timing. Retained heap is measured at quiescence after each
operation with two explicit GCs and cannot substitute for peak evidence.

## Separate consumer stress

After five complete resets, the worker asks the real report service for both
projects' twelve-month website reports and previous-year comparisons. This is
additional application coverage, not an artificial workload used to claim reset
improvement. All three base processes abort in this phase, after all reset records
and integrity checks are saved; none reaches final clear.

| Pair | Base annual outcome / command exit | Base observed annual peak heap MiB | Changed annual seconds | Changed observed annual peak heap MiB | Changed clear seconds | Changed command exit |
| ---- | ---------------------------------- | ---------------------------------: | ---------------------: | ------------------------------------: | --------------------: | -------------------: |
| 1    | OOM / 1                            |                            1,533.8 |                 64.066 |                                 353.0 |                 0.134 |                    0 |
| 2    | OOM / 1                            |                            1,525.9 |                 71.612 |                                 366.7 |                 0.379 |                    0 |
| 3    | OOM / 1                            |                            1,533.6 |                 65.916 |                                 350.2 |                 0.145 |                    0 |

Every changed process completes both reports and final clear, then exits 0 with
all original budgets and integrity checks passed. Reports retain at least 365
dates in each current/previous series with nonzero session totals. Base OOM leaves
no completed annual duration or post-GC retained observation; neither is inferred.

## Workload, isolation and budgets

The test creates the real standalone application, installed plugins and migrations
in a fresh child process with test-owned SQLite, filesystem storage, queue and job
paths. It calls the registered lifecycle's real import, reset and clear methods.
Business generation, collectors, aggregation and cleanup are not mocked. Fixed
application demo responders supply external services; unexpected global fetches
fail and no online credentials are used.

The clock is fixed to `2026-10-29T08:00:00Z`, language `en-US`, with real timers.
All six completed processes have exactly matching integrity results: two
projects, five demo accounts, 86 tasks (47 + 39), and 4,850 Google partitions.
Each of five source/grain combinations per project covers 485 days from
2025-06-29 through 2026-10-26. Every reset verifies the complete coverage, no
skipped generation stages, deletion of a real orphan attachment and metadata,
and preservation of the original administrator session. No history, projects,
tasks or accounts were removed to lower the footprint.

Fixed full-application budgets remain: 900 MiB observed heap across startup,
resets and report stress; 1,400 MiB whole-command OS RSS; 400 MiB retained heap
per reset; 300 seconds per reset; and a 35-minute process deadline. Missing
completion, abnormal exit and timeout fail. Both versions use the same 1,536 MiB
old-space limit. Budgets are never recalculated from results. The additional
relative gate requires each of all three pairs to reduce both reset peaks by at
least 20%, with no command-lifetime OS RSS regression.

## Instrumentation and environment

Formal workers never enable Inspector, CPU profiling, HeapProfiler sampling or
Intl constructor tracing, including during warmup. All environment/result records
say `profileEnabled: false`, and no formal allocation profile exists. The earlier
[allocation diagnostic](instrumentation-pilot.md) is explicitly excluded: even a
warmup-only profile contaminates lifetime high-water and allocator state.
In this Node version, reading or stopping Inspector allocation sampling also
forces GC internally, as documented in the excluded diagnostic with links to the
official source. Its source-level allocation estimates are not interpreted as a
natural-GC surviving-object graph. The profiler-free formal runs do not execute
that retrieval path and require no rerun for this clarification.

Main-isolate heap/RSS are sampled every 10 ms; pre-collection V8 GC observations
supplement heap spikes while synchronous JS blocks that timer. These are observed
heap peaks, not proof of every instantaneous allocation peak. A separate native
Worker thread samples process RSS every 5 ms throughout reset windows. Both
versions use identical instrumentation. No explicit GC runs inside a measured
operation; retained-heap GCs run only after its timer and peak sampling stop.

The RSS sampler is thread 1 in the actual application worker. Recorded GC PIDs
match that worker, and saved process trees identify `/usr/bin/time` -> Vitest
controller -> application worker. `process.resourceUsage().maxRSS` belongs to
that worker and is observed at phase completion. `/usr/bin/time -l` separately
records the maximum process RSS in the command tree through exit, including
abnormal exits; it is not a sum of process RSS and is not a reset-local peak.
Vitest can terminate a worker without an exit hook, so no unreliable exit-hook
measurement is claimed. OS command high-water is at least every observed worker
high-water. Before/after sampler startup RSS records instrumentation plus
concurrent startup activity, not exact attribution of all bytes to the sampler.

| Process   | App PID / parent PID | RSS thread | RSS before / after sampler (MiB) | Observed startup delta (MiB) | Worker observed lifetime high-water (MiB) |
| --------- | -------------------: | ---------: | -------------------------------: | ---------------------------: | ----------------------------------------: |
| 1/base    |          8542 / 8540 |          1 |                    515.7 / 525.2 |                          9.5 |                                   1,537.8 |
| 1/changed |          9485 / 9483 |          1 |                    455.0 / 465.1 |                         10.1 |                                     773.9 |
| 2/base    |        26965 / 26963 |          1 |                    467.1 / 471.8 |                          4.6 |                                   1,454.6 |
| 2/changed |        25467 / 25464 |          1 |                    438.2 / 448.5 |                         10.2 |                                     752.0 |
| 3/base    |        39669 / 39667 |          1 |                    503.3 / 514.0 |                         10.7 |                                   1,490.4 |
| 3/changed |        41136 / 41132 |          1 |                    473.0 / 482.7 |                          9.7 |                                     779.2 |

Machine: Apple M4, Mac16,12, 10 logical CPUs, 16 GiB RAM, macOS 27.0 arm64.
Node **v24.22.1**, pnpm **11.7.0**, Vitest **4.1.11**, SQLite driver
**0.1.0-beta.6**, DB **1.0.0-beta.23**, App Server **3.0.0-beta.4**, Demo Mode
**0.2.0-beta.5**, App Testing **0.1.0-beta.6**. Lockfile SHA-256:
`301c750fec0b21e5019c4bbb2fcd2c86e093085d7c0b21f7c665ca99a67fd43e`.

Frozen `run.py` SHA-256:
`0a48db7054887468fdc02450652ef80712f21798aab22f83bf580904635cae14`.
Frozen resource worker SHA-256:
`e8f5a0173ce4ac91873d0472dc8b7b6ca3a7441ef45ed90d95ed792455f7c06c`.
All three pairs match these hashes, commands, dependencies, hardware, source hashes
per label and exact integrity results. All six application processes are distinct.

| Process   | Start UTC            | Whole command seconds | Host load 1/5/15 min | Free disk GiB | Command exit |
| --------- | -------------------- | --------------------: | -------------------- | ------------: | -----------: |
| 1/base    | 2026-10-29T08:23:05Z |               192.391 | 3.00 / 3.91 / 5.15   |          7.66 |            1 |
| 1/changed | 2026-10-29T08:26:18Z |               319.420 | 3.89 / 3.81 / 4.85   |          7.64 |            0 |
| 2/base    | 2026-10-29T09:13:07Z |               256.653 | 5.12 / 4.60 / 4.75   |          7.54 |            1 |
| 2/changed | 2026-10-29T09:07:47Z |               320.363 | 4.21 / 4.67 / 4.86   |          8.52 |            0 |
| 3/base    | 2026-10-29T09:53:27Z |               210.077 | 4.10 / 4.38 / 4.88   |          6.26 |            1 |
| 3/changed | 2026-10-29T09:56:57Z |               361.810 | 6.28 / 5.02 / 5.02   |          6.22 |            0 |

The machine also runs other sessions. The shared advisory lock
`/tmp/demo-reset-resource-benchmark.lock` serializes cooperating resource jobs;
it cannot eliminate unrelated CPU, memory or I/O load. Each pair holds the lock
only for its two processes and necessary source overlays, restoring source and
releasing before another application runs. Ordinary tests, lint, type checks and
documentation work stay outside the lock. Pair 2 originally queued at 08:31:38
UTC, withdrew for an older waiter, and started only on explicit release at
09:07:47 UTC. It completed at approximately 09:17:25 UTC; restoration and release
were verified at 09:18:22 UTC. Pair 3 started only after explicit coordinator
release at 09:53:27 UTC, completed at approximately 10:03:00 UTC, and its source
restoration and lock release were verified at 10:03:20 UTC. The verification is
preserved in `pair-3/completion-verification.json`. No further resource task was
started. The archived scheduling record documents the earlier pair-2 hold; the
final archive manifest records all three completed pairs.

## Reproduction and artifacts

See the [resource procedure](../../../tests/nocoreach/resource/README.md) for
commands, test scope and recovery precautions. On an available host, the committed
comparison runner performs AB/BA/AB with one lock acquisition per pair:

```sh
pnpm install --frozen-lockfile
python3 tests/nocoreach/resource/compare.py f55023ac3b6e197a85d9bccb77f8146ddb27f643 /tmp/nocoreach-reset-comparison
python3 tests/nocoreach/resource/compare-results.py /tmp/nocoreach-reset-comparison
```

For these coordinated runs, the original comparison was stopped while waiting
for pair 2, before it had any child process or source overlay. The archived
`orchestration/resume-pair.py` resumes one pair against the existing output,
validates frozen harness/source hashes, and restores the four files in `finally`.
It changes neither the child command nor measured instrumentation. Actual resumed commands, each run only after its own explicit release:

```sh
python3 /tmp/nocoreach-resume-pair.py 2 > /tmp/nocoreach-formal-pair2.log 2>&1
python3 /tmp/nocoreach-resume-pair.py 3 > /tmp/nocoreach-formal-pair3.log 2>&1
```

The raw archive contains all six processes' unmodified logs, environment/result
JSON, derived summaries, all-round CSV, process snapshots, source backup, exact
frozen harness, orchestration and the successful three-pair comparison result.
The local original root is `/tmp/nocoreach-resource-formal-clean-20261029`.
`compare-results.py` passed against that root after the last pair restored source
and released the shared lock. Archived raw observations were not rewritten to
pass budgets or improve an earlier result.

## Change, validation and limits

The application streams GA4 facts, including hour/event expansion, into aggregation
instead of retaining an entire range. Worlds no longer retain derived GA4 facts,
cache at most one day with 20,000 scalar visit buckets, retire on project removal
or replacement and use an eight-world LRU. Cleanup pages attachments and inbox
records while retaining blob-before-metadata retry semantics and active-work
refusal. Grouped result rows still occupy memory; arbitrary future high-cardinality
reports may require further work.

Twenty original-base response digests preserve row ordering, metric sums and
weighted ratios, totals, filters, pagination, overlapping ranges and hour/event
expansion across both projects and languages. Cache lifecycle tests and real
application cleanup coverage include 410 blobs, 405 mixed notifications, unrelated
notification retention, active work refusal and failed-storage retries.

Relevant seven-file validation initially passed 36 cases with one failure in the
new test's unsupported repository `$in` assertion. That assertion was corrected
to the query builder, and the focused full application case passed. All 37 unique
cases were therefore verified across those runs, not one green 37-case run.
Server type checking and scoped ESLint passed. Unrelated aggregate checks were
not repeated. No production code or measurement harness changed between formal
pairs.

All measured benefits are application-specific on the published dependencies
above and require no framework upgrade. This PR does not implement copied reset
scheduling, retry, lease, tracking, status-query or diagnostic infrastructure.
Studio and shared framework work belongs to their respective components and is
not credited here. No concrete common-plugin hotspot was established.

These local full-reset measurements do not establish the root cause of the
reported production ITAM generate-stage OOM or fix every OOM. Current main has
not been matched to deployed revisions; no production server was accessed.
SQLite/macOS results do not establish Linux/server-database performance or behavior
under concurrent visitor load. All three formal pairs pass the predefined local resource gate. This scoped
result does not remove the production and platform limitations above.

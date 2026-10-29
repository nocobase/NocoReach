# NocoReach demo reset pilot — 2026-10-29

## Scope and reproduction

Base: `f55023ac3b6e197a85d9bccb77f8146ddb27f643` (fresh `origin/main`).
Changed: the four application source files in this PR; their exact SHA-256 values
are in `changed/environment.json` in the [raw archive](pilot-measurements.tar.gz).
Both runs have the same git HEAD because the base/changed source was swapped and
restored in the same worktree. Only those four source hashes differ; the harness,
lockfile and complete business-integrity results match exactly.

This historical pilot used the archived `harness/` files, not the later formal
instrumentation. Its original per-version commands were:

```sh
python3 tests/nocoreach/resource/run.py /tmp/nocoreach-resource-base-final
python3 tests/nocoreach/resource/run.py /tmp/nocoreach-resource-changed-final
```

The four production files were restored from the named base before the first
command and from the changed source before the second. For a new comparison use
the current [test procedure](../../../tests/nocoreach/resource/README.md); it
adds independent RSS sampling and three pairs and must not be mixed with these
historical observations.

See the [test procedure](../../../tests/nocoreach/resource/README.md) for isolation,
budgets, sampling limits and source-restoration precautions. The archive includes
unmodified environment/result JSON and raw V8/application logs for both final
runs, derived summaries, and the exact measured harness. Extract it to a fresh
directory with `tar -xzf pilot-measurements.tar.gz`.

Environment: Apple M4, Mac16,12, 10 logical CPUs, 16 GiB RAM, macOS 27.0 arm64;
approximately 7.9 GiB available disk at setup. Node **v24.22.1**, pnpm **11.7.0**,
SQLite driver **0.1.0-beta.6**, DB **1.0.0-beta.23**, App Server **3.0.0-beta.4**,
Demo Mode **0.2.0-beta.5**, App Testing **0.1.0-beta.6**, Vitest **4.1.11**.
Both child workers used the same 1,536 MiB old-space limit. No heap-limit increase
was used for the changed run. Dependencies were installed in this worktree using
the shared pnpm store; there was no second checkout or node_modules copy.

Heavy measurements acquired `/tmp/demo-reset-resource-benchmark.lock`.
Other sessions were active on the host; this advisory lock serializes cooperating
jobs, not all background CPU/memory/I/O load. These are one paired run with five
cycles each, not a controlled estimate of production throughput.

## Full application reset results

The real standalone application imports the English edition once, then resets it
five times through the registered Demo Mode lifecycle. The clock is fixed at
`2026-10-29T08:00:00Z`. Both projects retain all 86 tasks, five demo accounts,
and **4,850 Google partitions**: five source/grain combinations per project,
each with 485 days from **2025-06-29 to 2026-10-26**. Every cycle verifies identical
coverage, no skipped generator stages, removal of an orphan stored attachment,
and preservation of the original administrator session.

Each paired cell below is **base / changed**. Heap peaks combine 10 ms samples
and V8 pre-GC observations; retained heap is measured after quiescent explicit GC.
No explicit GC runs during a measured operation.

| Reset | Duration (s)  | Observed heap peak (MiB) | Retained heap (MiB) |
| ----- | ------------- | ------------------------ | ------------------- |
| 1     | 42.20 / 40.62 | 1122.2 / 495.1           | 669.0 / 180.1       |
| 2     | 46.30 / 38.10 | 1142.2 / 503.5           | 669.7 / 180.6       |
| 3     | 54.05 / 37.26 | 1197.9 / 504.9           | 669.9 / 180.9       |
| 4     | 40.18 / 37.44 | 1225.8 / 500.0           | 670.6 / 181.3       |
| 5     | 30.94 / 37.85 | 1228.8 / 492.5           | 671.3 / 181.5       |

- Median reset: **42.20 / 37.85 seconds** (10.3% lower in this paired run).
- Largest observed reset heap: **1,228.8 / 504.9 MiB** (58.9% lower).
- Process RSS high-water through reset 5: **1,470.3 / 795.1 MiB** (45.9% lower).
- Retained heap after reset 5: **671.3 / 181.5 MiB** (73.0% lower).
- Cold warmup import: **33.79 / 48.62 seconds**. It became slower in this run;
  removing persistent derived facts trades some recomputation for bounded memory.
  Do not generalize the reset median into a claim that every phase is faster.

The base exceeds the committed 900 MiB observed-heap, 1,400 MiB RSS and 400 MiB
retained-heap budgets. The changed run passes those budgets and the 300-second
per-reset limit with margin. Its reset retained heap rises only about 1.4 MiB
from round 1 to round 5. Budgets were not updated to accept the base's footprint.

## Separate annual-report stress and final clear

After all five resets, the same process reads each project's 12-month website
report plus its previous-year comparison using the real report service. This is
**additional consumer stress, not reset time**.

- Base: worker aborts with a V8 heap OOM; the last observed heap reaches
  **1,531.5 MiB**. There is no completed duration, final RSS or retained measurement
  for this phase. The controller exits 1 and preserves all five reset records.
- Changed: reports complete in **47.70 seconds**, with **346.7 MiB** observed peak
  heap. Both projects have complete current reports and at least 365 days in
  both the current and previous series, with nonzero session totals.
- Changed final lifecycle clear completes in **0.134 seconds** and leaves no
  projects. The overall test exits 0, including all budgets and the network-fetch
  refusal check. The base never reaches this final-clear phase.

The changed process's overall observed heap peak is **504.9 MiB**, and its
process-lifetime RSS high-water is **795.1 MiB** including startup, resets, reports
and clear. The archived logs capture the abnormal base exit; it is not reported
as a passing baseline.

## Interpretation and boundaries

The production changes remove history-sized GA4 fact retention, stream hourly
and event facts into aggregation, retain at most one bounded visit day per world,
and retire project worlds on removal/replacement with an eight-world LRU bound.
They do not reduce demonstration dates, projects, tasks, identities or sessions.
The exact-response regression records 20 original-base response digests covering
two projects and languages, metrics/ratios/totals, filtering, paging, overlapping
ranges and hour/event expansion. Additional application tests cross cleanup
pages with 410 blobs and 405 mixed notifications, retain unrelated messages,
refuse active work and exercise failed-storage retries.

All measured benefits use the currently published framework dependencies above.
This PR does not duplicate daily reset scheduling, retries, leases, tracking,
status queries or runtime diagnostics. Shared framework and Studio improvements
belong to those components and require their corresponding upgrade; none of
those prospective benefits is included in these measurements.

This local NocoReach result does not establish the root cause of the reported
2026-10-29 production ITAM generate-stage OOM. Deployed revisions have not been
matched to current main. No production server was accessed. SQLite/macOS results
do not establish Linux/server-database performance. No concurrent visitor load
was benchmarked. Aggregation still retains its output groups, so arbitrary
high-cardinality dimensions or much larger future fixtures may need further
work. Sampled/pre-GC heap observations can miss very brief allocation peaks;
RSS is an OS process-lifetime high-water mark, not a reset-local reading.

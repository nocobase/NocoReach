# Demo reset resource regression

Run from an otherwise idle checkout with `pnpm install --frozen-lockfile`, Python 3
(on macOS/Linux, for `fcntl`) and **Node v24.22.1**:

```sh
python3 tests/nocoreach/resource/run.py /tmp/nocoreach-reset-run-1
```

The runner serializes heavy measurements with
`/tmp/demo-reset-resource-benchmark.lock`, starts a new Vitest worker with
`--expose-gc --trace-gc-nvp --max-old-space-size=1536`, and fails on an abnormal
exit, timeout (35 minutes including startup), missing completion or exceeded
budget. The worker uses the application's real standalone server, registered
plugins, migrations, demo lifecycle, business generator, collectors and cleanup.
There is no mocked database, generator, reset or aggregation helper. SQLite,
filesystem blobs, queues and jobs use test-owned temporary paths. The parent
removes its temporary tree even after a worker crash. No credentials are needed;
the application's fail-closed demo world supplies external services. Unexpected
global fetches fail the test.

Ordinary `pnpm test` skips this opt-in test. Do not set `DEMO_RESOURCE_TEST` by hand:
the runner provides isolation, the Node/version checks, the process deadline and
GC-log budget checks.

## Fixed workload and assertions

The test fixes the business clock to `2026-10-29T08:00:00Z`, leaving timers and
`performance.now()` real. It imports the English edition once to warm up, then
performs **five real lifecycle resets**. It retains both projects, the complete
supported history (about sixteen months), five demo accounts, and all 47 + 39
tasks. Each reset receives an orphan visitor attachment in real local storage.
Assertions verify lifecycle status, no skipped generator stages, identical
per-source/grain/date partition coverage, complete history start, task counts,
blob/metadata removal and preservation of the original administrator session.

After all five resets, a **separate annual-report stress phase** reads both
projects' 12-month website reports and their previous-year comparisons through
the application's report service. This can request additional history and hour
or event breakdowns; it is not part of reset timing. Final lifecycle clear checks
that no projects remain. The regular `demo-data-app.test.ts` also checks account
and configuration preservation, refusal of active work, storage failure/retry,
and multi-page cleanup (410 attachments and 405 mixed inbox items).

Each operation samples main-isolate heap/RSS every 10 ms without forcing GC. A separate native Worker thread samples process RSS every 5 ms even while the application thread is busy; `windowPeakRss` is that reset-window peak. Both versions run identical sampler code; startup RSS deltas are reported separately. Synchronous JS
can block the main-thread heap sampler, so the parent also parses V8's pre-collection
`start_object_size` / `total_size_before` readings. These are **observed heap
peaks, not a claim to capture every allocation**. `process.resourceUsage().maxRSS`
is the operating system's process-lifetime RSS high-water mark, including
application startup and test tooling. Quiescent retained heap is measured with
two explicit GCs only after the timed operation and peak sampler have stopped.
The parent wraps each command in the OS `/usr/bin/time` tool (`-l` on macOS, `-v` on Linux), recording `commandTreeOsMaxRss` including exited descendants and abnormal exits. This is a process-tree high-water measure, not the sum of simultaneously resident processes. Raw logs retain GC evidence for crashes too; a crash cannot produce a quiescent retained measurement. Inspector profiling is **off from process startup through exit** in formal runs. Diagnostic allocation sampling requires the explicit `run.py OUTPUT --profile` option, is labeled instrumentation pilot, and is rejected by the formal comparison checker. Even a warmup-only profile contaminates lifetime RSS and allocator state, so it is never mixed into formal repeats. In Node v24.22.1, reading or stopping Inspector allocation sampling itself forces GC, even without a heap snapshot or an explicit collectGarbage command. The [excluded diagnostic](../../../docs/benchmarks/demo-reset-20261029/instrumentation-pilot.md) links the official implementation and is used only for allocation-site attribution, never as a natural-GC surviving-object graph or peak comparison. Profiler-free formal workers do not execute that path.

Budgets cover the whole application worker: 900 MiB observed heap (including
startup, resets and report stress), 1,400 MiB process high-water RSS, 400 MiB
post-GC retained heap per reset, and 300 seconds per reset. The 1,536 MiB heap
limit is an identical failure guard for base and changed, not an optimization.
Budgets are deliberately explicit and never rewritten from a new run.

## Comparing revisions in the same worktree

```sh
python3 tests/nocoreach/resource/compare.py f55023ac3b6e197a85d9bccb77f8146ddb27f643 /tmp/nocoreach-reset-comparison
```

The comparison runs **three independent process pairs in AB, BA, AB order**, each with its own warmup and five resets. The original single-pair pilot is retained separately and is not counted as a repeat. Each pair acquires the shared lock, runs both versions, restores source, and releases the lock before the next pair queues; lint, type checks and ordinary tests must stay outside this lock. Each process records host load, disk space and process interference before starting.

The comparison temporarily replaces **only the four changed production source
files** with `git show` output according to the pair order. It runs the same
harness in a fresh process for each version and restores current source in
`finally` before releasing the lock. Do not edit these files or
start other tests/dev servers in this checkout until it finishes. It saves a
source backup under the output directory for recovery from a host interruption.
It creates no checkout and copies no dependencies. Other applications on the
same host must honor the shared lock independently; unrelated host load is not
controlled by this test.

Each `pair-N/base` or `pair-N/changed` output directory contains `environment.json` (Node, hardware, git HEAD,
source/harness/lockfile SHA-256, command, exit status, elapsed time and observed
GC heap peak), `result.json` (completed stages, timings, memory and integrity),
and `raw.log` plus `processes-before.txt`. Only an explicit diagnostic run writes `allocation-profile.json`; formal runs reject that file. A baseline source swap leaves HEAD unchanged: use the recorded
source hashes and the explicitly named base, not HEAD alone, to identify it.
A failed baseline is preserved and does not prevent measuring changed source.
The comparison command's exit code requires all three changed runs to pass; inspect both
results before interpreting a comparison.

For response parity and cache lifetime without a full app:

```sh
pnpm exec vitest run tests/nocoreach/demo-google-aggregation.test.ts tests/nocoreach/demo-world-cache.test.ts --maxWorkers=1
```

The response digests were captured from the original base, before optimization.
Do not regenerate them to accept a changed response without reviewing the
underlying semantics. They cover two projects and two languages, all supported
metrics, weighted ratios, totals, filters, pagination, overlapping date ranges
and hour/event expansion.

Formal acceptance requires three independent pairs, each with at least **20% lower
reset-window observed peak heap and 20% lower reset-window peak RSS**, plus no
regression in command-tree OS RSS high-water. The checker treats each process's
maximum across its five resets as one observation; it does not count five cycles
as five independent experiments. Absolute budgets alone are not evidence of an
optimization.

```sh
python3 tests/nocoreach/resource/compare-results.py /tmp/nocoreach-reset-comparison
```

`result.json` names the actual application worker PID/parent PID, the RSS sampler
thread ID, intervals, profiling flag and process RSS before/after sampler startup.
The startup delta is an observation of instrumentation plus concurrent startup
activity, not an exact attribution of all bytes to the sampler. GC trace PIDs
must match the application worker PID. `processMaxRss` comes from that worker's
OS accounting while it is alive. Vitest can terminate a worker without an `exit`
hook, so the harness does not pretend such a hook supplies reliable final data.
`commandTreeOsMaxRss` comes independently from `/usr/bin/time`, includes the real
application worker and harness/descendants through exit, and must be at least the
worker's observed high-water. It is clearly separated from `windowPeakRss`.

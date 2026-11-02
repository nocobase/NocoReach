# Page loading measurements

Use an isolated application and synthetic data. Compare a common base, the original change and a candidate on the same database snapshot, browser, viewport, network profile, CPU setting and navigation path. Build production clients before measurement; do not run builds or other verification workloads during measurement.

## Reproducible data

Generate the complete dataset with the application's Demo Mode CLI, then preserve one snapshot per database engine. Keep generation and every subsequent process in the same encryption environment so Google and other sealed connections remain readable. Do not export the encryption key, database, cookies or authentication state with the evidence.

Use dedicated storage and databases. Put the demo reset outside the measurement window before generation. Record the generation language, date, record counts, source availability and snapshot SHA-256. For SQLite, restore the exact absolute `DB_FILENAME` that the process opens and verify its open file descriptor after each start. For PostgreSQL and MySQL, restore the same logical dump before each version. State engine versions separately; MariaDB is not a substitute for MySQL compatibility evidence.

## Scenarios and readiness

Run at least five interleaved rounds, rotating the version order. Cover HTTP cache cold and warm reloads, return navigation and affected interactions. Also measure a cold reload after clearing the application's persisted report cache; label that separately from an HTTP cache reset. Keep each scenario's setup identical across versions.

A page is usable when its representative core data and an enabled key action are visible, and a harmless click on its heading is handled by the next animation frame. Record the data and actions used by the assertion. `load`, network idle and a successful API response alone do not establish usability. Verify Google metrics when Google sources are part of the dataset.

Retain every raw value, median and min–max, including unusual samples. Record machine load. Do not report a reliable P95 from five samples. Keep follow-up measurements separate when investigating an outlier.

## Attribution and equivalence

Record request start, response start, response end, payload size, request count, LCP, long tasks and readiness. Match `x-request-id` to the server request log's `durationMs`; browser round-trip time includes transport and body consumption and must remain a separate metric. Observe SQL counts and operation types without logging parameters or credentials.

Independent responses still share bandwidth and the browser main thread. Test a scheduling hypothesis by changing only one request's start, then compare response timelines and server durations. Do not add overlapping durations or attribute all TTFB to server computation. Parallel reads do not remove query or JSON processing costs, and SQLite's single connection cannot execute its queries concurrently.

Before delivery, verify refreshes, retry and forbidden states, full history, search and sorting, account/project boundaries, both languages and permission revocation in an open session. Keep functional snapshots and endpoint comparisons separate from timings. Publish sanitized measurement tools and evidence with the verification record, outside the source repository. CI and independent review apply to the actual delivered commit.

# Excluded allocation diagnostic

This [instrumentation pilot](instrumentation-pilot.tar.gz) is **not a formal
peak-memory observation or an independent repeat**. It enabled Inspector
allocation sampling during warmup. Even though sampling stopped before reset
rounds, it changed lifetime OS RSS and allocator/GC state. The run was stopped
at the user's correction, only its own process group was terminated, source was
restored byte-for-byte, and the shared lock was released before re-queuing clean
formal pairs. No changed process was started for this pair.

The original baseline source was `f55023ac3b6e197a85d9bccb77f8146ddb27f643`.
The raw sampling profile is retained solely to locate allocation sites during
the full-app warmup import (64 KiB sampling interval). The table sums the
profile's estimated allocation bytes by source file:

| Allocation source                            | Summed sampled allocation estimates (bytes) |
| -------------------------------------------- | ------------------------------------------: |
| `server/nocoreach/demo-data/world/google.ts` |                                 370,468,064 |
| `server/nocoreach/demo-data/world/world.ts`  |                                 107,778,728 |
| All sampled sources combined                 |                                 513,446,608 |

Those two application files account for about 93.1% of the summed estimates in
this profile. This is allocation-site evidence under profiler-altered GC, not
93.1% of process RSS, a natural-GC surviving-object graph, an exact retained heap
census or a peak comparison. It supports the cache/fact hotspot already identified
by the initial GC/retention pilot and source audit. No common framework allocation
hotspot was established by this diagnostic. The historical summary field
`warmupSampledRetainedAllocations` remains unchanged in the raw archive; its name
does not establish natural-GC retention semantics.

In Node v24.22.1, Inspector `startSampling` always sets `kSamplingForceGC`.
`getSamplingProfile` calls `GetAllocationProfile`, and `stopSampling` retrieves
the profile before stopping. See the [version-pinned Inspector implementation](https://raw.githubusercontent.com/nodejs/node/v24.22.1/deps/v8/src/inspector/v8-heap-profiler-agent-impl.cc#L515).
With that flag, [V8's profile retrieval explicitly calls `CollectAllGarbage`](https://raw.githubusercontent.com/nodejs/node/v24.22.1/deps/v8/src/profiler/sampling-heap-profiler.cc#L266).
Consequently, this diagnostic's `stopSampling` induced GC even without a
`collectGarbage` command or heap snapshot. Its profile is useful only for locating
allocation sources; it does not describe the uninstrumented process's object
survival or demonstrate peak-memory savings.

The current runner loads Inspector only with the explicit `--profile` option.
Formal runs force `profileEnabled: false` for the entire worker lifetime, and
`compare-results.py` rejects either an enabled flag or an allocation-profile
file. The clean formal runs use a different, internally identical harness SHA;
no instrumented result is mixed with an uninstrumented changed result.

#!/usr/bin/env python3
"""Summarize saved observations without modifying budgets or raw results."""
import json
from pathlib import Path
import re
import statistics
import sys


def summarize(folder):
    result = json.loads((folder / 'result.json').read_text()) if (folder / 'result.json').exists() else {}
    environment = json.loads((folder / 'environment.json').read_text())
    phases = {}
    current = 'startup'
    for line in (folder / 'raw.log').read_text().splitlines():
        if 'RESOURCE_PHASE_START ' in line:
            current = line.split('RESOURCE_PHASE_START ', 1)[1].strip()
        peak = re.search(r'(?:total_size_before|start_object_size)=(\d+)', line)
        if peak:
            phases[current] = max(phases.get(current, 0), int(peak[1]))
        if 'RESOURCE_PHASE_END ' in line:
            current = 'between-phases'
    rounds = result.get('rounds', [])
    observations = [result.get('warmup'), *rounds, result.get('annualReports'), result.get('clear')]
    for row in observations:
        if row:
            phases[row['name']] = max(phases.get(row['name'], 0), row['sampledPeakHeap'])
    summary = {
        'observedPeakHeapByPhase': phases, 'completedResets': len(rounds),
        'resetMedianMs': statistics.median(r['elapsedMs'] for r in rounds) if rounds else None,
        'resetWindowPeakHeap': max([phases[r['name']] for r in rounds] or [0]),
        'resetWindowPeakRss': max([r.get('windowPeakRss', r['sampledPeakRss']) for r in rounds] or [0]),
        'rssSampler': 'independent 5 ms thread' if rounds and 'windowPeakRss' in rounds[0] else 'pilot main-thread 10 ms sampler',
        'workerObservedMaxRss': max([r['processMaxRss'] for r in observations if r] or [0]),
        'commandTreeOsMaxRss': environment.get('commandTreeOsMaxRss'),
        'resetComplete': result.get('resetComplete', False), 'complete': result.get('complete', False),
    }
    profile_file = folder / 'allocation-profile.json'
    if profile_file.exists():
        files = {}
        def visit(node):
            url = node['callFrame']['url'] or '(runtime)'
            files[url] = files.get(url, 0) + node['selfSize']
            for child in node.get('children', []):
                visit(child)
        visit(json.loads(profile_file.read_text())['profile']['head'])
        summary['warmupSampledRetainedAllocations'] = {
            'estimatedBytes': sum(files.values()),
            'largestSourceFiles': sorted(files.items(), key=lambda item: item[1], reverse=True)[:12],
        }
    return summary


if __name__ == '__main__':
    print(json.dumps(summarize(Path(sys.argv[1])), indent=2))

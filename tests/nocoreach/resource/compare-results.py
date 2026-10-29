#!/usr/bin/env python3
"""Require three independent pairs with repeatable reset-window peak reductions."""
import json
from pathlib import Path
import sys
from summarize import summarize

folder = Path(sys.argv[1])
pairs = []
reference = None
source_references = {}
processes = set()
for index in range(1, 4):
    pair = folder / f'pair-{index}'
    pair_metadata = json.loads((pair / 'pair.json').read_text())
    assert pair_metadata['order'] == (['changed', 'base'] if index == 2 else ['base', 'changed'])
    # The outer runner also checks GC-observed peaks and OS RSS after Vitest exits.
    assert pair_metadata['exitCodes']['changed'] == 0, 'Changed resource runner failed'
    results = {}
    for label in ['base', 'changed']:
        run = pair / label
        environment = json.loads((run / 'environment.json').read_text())
        result = json.loads((run / 'result.json').read_text())
        assert environment['profileEnabled'] is False and result['profileEnabled'] is False
        assert not (run / 'allocation-profile.json').exists()
        identity = [environment['node'], environment['command'], environment['harnessSha256'], environment['lockfileSha256'], environment['platform'], environment['machine'], environment['cpuCount'], environment.get('hardware'), result['integrity']]
        source_references.setdefault(label, environment['sourceSha256'])
        assert source_references[label] == environment['sourceSha256']
        processes.add((result['pid'], environment['startedAt']))
        if reference is None:
            reference = identity
        assert identity == reference, 'Harness, dependency, Node or data mismatch'
        summary = summarize(run)
        assert summary['completedResets'] == 5 and summary['resetComplete']
        if label == 'changed':
            assert summary['complete'] and environment['exitCode'] == 0
        (run / 'summary.json').write_text(json.dumps(summary, indent=2))
        results[label] = summary
    reductions = {metric: 1 - results['changed'][metric] / results['base'][metric]
                  for metric in ['resetWindowPeakHeap', 'resetWindowPeakRss']}
    # A fixed relative gate complements the absolute budgets; never accept a new baseline automatically.
    assert all(reduction >= 0.20 for reduction in reductions.values()), reductions
    assert results['changed']['commandTreeOsMaxRss'] <= results['base']['commandTreeOsMaxRss']
    pairs.append({'pair': index, 'order': pair_metadata['order'],
                  'results': results, 'relativePeakReductions': reductions})
assert len(processes) == 6
(folder / 'comparison.json').write_text(json.dumps(pairs, indent=2))
print(json.dumps([{k: p[k] for k in ['pair', 'order', 'relativePeakReductions']} for p in pairs], indent=2))

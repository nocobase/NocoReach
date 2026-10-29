#!/usr/bin/env python3
"""Run three independent AB/BA/AB pairs, releasing the shared lock after each pair.

Run only in an otherwise idle worktree: source is swapped inside each pair and
restored in finally. Do not edit production source or run a dev server here.
"""
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
revision, output = sys.argv[1:]
output = Path(output).resolve()
files = ['server/nocoreach/demo-data/' + name + '.ts' for name in
         ['world/world', 'world/google', 'upstream', 'clear-all']]
originals = {name: (ROOT / name).read_bytes() for name in files}
base = {name: subprocess.check_output(['git', 'show', f'{revision}:{name}'], cwd=ROOT)
        for name in files}
backup = output / 'source-backup'
backup.mkdir(parents=True, exist_ok=False)
for name, data in originals.items():
    (backup / name.replace('/', '_')).write_bytes(data)
results = []
for index, order in enumerate([['base', 'changed'], ['changed', 'base'], ['base', 'changed']], 1):
    pair = output / f'pair-{index}'
    pair.mkdir()
    print(f'Pair {index} ({"/".join(order)}) waiting for shared lock', flush=True)
    with open('/tmp/demo-reset-resource-benchmark.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        print(f'Pair {index} acquired lock; expected duration about 9 minutes', flush=True)
        try:
            pair_result = {'baseRevision': revision, 'order': order, 'exitCodes': {}}
            for label in order:
                for name, data in (base if label == 'base' else originals).items():
                    (ROOT / name).write_bytes(data)
                run = subprocess.run(['python3', 'tests/nocoreach/resource/run.py', str(pair / label)],
                                     cwd=ROOT, env={**os.environ, 'DEMO_RESOURCE_LOCK_FD': str(lock.fileno())},
                                     pass_fds=(lock.fileno(),))
                pair_result['exitCodes'][label] = run.returncode
            results.append(pair_result)
            (pair / 'pair.json').write_text(json.dumps(pair_result, indent=2))
        finally:
            for name, data in originals.items():
                (ROOT / name).write_bytes(data)
    print(f'Pair {index} released shared lock', flush=True)
print(json.dumps(results, indent=2), flush=True)
sys.exit(0 if all(p['exitCodes']['changed'] == 0 for p in results) else 1)

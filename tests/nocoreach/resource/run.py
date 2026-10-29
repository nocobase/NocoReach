#!/usr/bin/env python3
"""Run the full-app resource test in a fresh process under a shared host lock."""
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import signal
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[3]
LOCK = '/tmp/demo-reset-resource-benchmark.lock'


@contextlib.contextmanager
def benchmark_lock():
    inherited = os.environ.get('DEMO_RESOURCE_LOCK_FD')
    if inherited:
        fd = int(inherited)
        assert os.fstat(fd).st_ino == os.stat(LOCK).st_ino
        # The pair runner passes the same locked open-file description to both children.
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    else:
        with open(LOCK, 'a') as lock:
            print('Waiting for shared benchmark lock', flush=True)
            fcntl.flock(lock, fcntl.LOCK_EX)
            yield


def run(output, profile=False):
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise RuntimeError('Use a fresh output directory; existing results are never overwritten')
    with benchmark_lock(), tempfile.TemporaryDirectory(prefix='nocoreach-resource-') as scratch:
        env = {**os.environ, 'TMPDIR': scratch, 'DEMO_RESOURCE_TEST': '1',
               'DEMO_RESOURCE_RESULT': str(output / 'result.json'), 'DEMO_RESOURCE_PROFILE': '1' if profile else '0', 'NOCOREACH_DEMO_AGENT_PACE': '0'}
        env.pop('NODE_OPTIONS', None)
        command = ['node', 'node_modules/vitest/vitest.mjs', 'run',
                   'tests/nocoreach/demo-reset-resource.test.ts', '--maxWorkers=1',
                   '--disableConsoleIntercept', '--execArgv=--expose-gc',
                   '--execArgv=--trace-gc-nvp', '--execArgv=--max-old-space-size=1536']
        # OS accounting includes exited descendants, including a worker that aborts on OOM.
        command = ['/usr/bin/time', '-l' if sys.platform == 'darwin' else '-v', *command]
        metadata = {
            'command': command, 'profileEnabled': profile,
            'node': subprocess.check_output(['node', '-v'], text=True).strip(),
            'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
            'platform': platform.platform(), 'machine': platform.machine(), 'cpuCount': os.cpu_count(),
            'lock': LOCK, 'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'loadAverage': os.getloadavg(), 'freeDiskBytes': os.statvfs(ROOT).f_bavail * os.statvfs(ROOT).f_frsize,
            'harnessSha256': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                              for p in [Path(__file__).resolve(), ROOT / 'tests/nocoreach/demo-reset-resource.test.ts']},
            'sourceSha256': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                             for p in sorted((ROOT / 'server/nocoreach/demo-data').rglob('*.ts'))},
            'lockfileSha256': hashlib.sha256((ROOT / 'pnpm-lock.yaml').read_bytes()).hexdigest(),
        }
        assert metadata['node'] == 'v24.22.1', metadata['node']
        if sys.platform == 'darwin':
            metadata['hardware'] = subprocess.check_output(
                ['sysctl', 'hw.model', 'hw.memsize', 'machdep.cpu.brand_string'], text=True).strip()
        (output / 'processes-before.txt').write_text(subprocess.check_output(
            ['ps', '-ax', '-o', 'pid,ppid,pcpu,rss,comm'], text=True))
        (output / 'environment.json').write_text(json.dumps(metadata, indent=2))
        if profile:
            print('INSTRUMENTATION PILOT: excluded from formal comparisons', flush=True)
        start = time.monotonic()
        with open(output / 'raw.log', 'w') as log:
            process = subprocess.Popen(command, cwd=ROOT, env=env, stdout=log,
                                       stderr=subprocess.STDOUT, start_new_session=True)
            try:
                code = process.wait(timeout=2100)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
                code = 124
        raw = (output / 'raw.log').read_text()
        gc_peak = max([int(v) for v in re.findall(r'(?:total_size_before|start_object_size)=(\d+)', raw)] or [0])
        rss = re.search(r'(\d+)\s+maximum resident set size', raw) if sys.platform == 'darwin' else re.search(r'Maximum resident set size \(kbytes\):\s*(\d+)', raw)
        os_rss = int(rss[1]) * (1 if sys.platform == 'darwin' else 1024) if rss else None
        result = json.loads((output / 'result.json').read_text()) if (output / 'result.json').exists() else {}
        gc_pids = sorted(set(int(pid) for pid in re.findall(r'\[(\d+):0x[^\]]+\].*gc=', raw)))
        metadata.update(commandPid=process.pid, applicationPid=result.get('pid'),
                        applicationParentPid=result.get('parentPid'), gcPids=gc_pids)
        metadata.update(exitCode=code, elapsedSeconds=time.monotonic() - start,
                        gcObservedPeakHeap=gc_peak, commandTreeOsMaxRss=os_rss)
        (output / 'environment.json').write_text(json.dumps(metadata, indent=2))
        complete = result.get('complete') and gc_pids == [result.get('pid')]
        if complete:
            observations = [result.get('warmup'), *result.get('rounds', []), result.get('annualReports'), result.get('clear')]
            assert os_rss >= max(row['processMaxRss'] for row in observations if row)
        print(json.dumps({k: metadata[k] for k in ['startedAt', 'exitCode', 'elapsedSeconds',
                                                  'gcObservedPeakHeap', 'commandTreeOsMaxRss']}, indent=2), flush=True)
        return 0 if code == 0 and complete and 0 < gc_peak < 900 * 1024 ** 2 and os_rss and os_rss < 1400 * 1024 ** 2 else 1


if __name__ == '__main__':
    assert sys.argv[2:] in [[], ['--profile']], 'Usage: run.py OUTPUT [--profile]'
    sys.exit(run(Path(sys.argv[1]).resolve(), profile='--profile' in sys.argv[2:]))

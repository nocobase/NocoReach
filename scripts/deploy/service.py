#!/usr/bin/env python3
"""Single-application deployment API. Compatible with the host's Python 3.6."""
import fcntl
import hashlib
import hmac
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn

REPOSITORY = 'registry.cn-beijing.aliyuncs.com/nocobase/nocoreach'
PREFIX = '/_deploy/nocoreach'
VERSION = re.compile(r'^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(alpha|beta|rc)\.(0|[1-9][0-9]*))?$')
IDENTIFIER = re.compile(r'^[a-zA-Z0-9_-]{8,80}$')
DIGEST = re.compile(r'^sha256:[0-9a-f]{64}$')
TERMINAL = ('succeeded', 'failed', 'manual_recovery')


class Rejected(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, message


def version_key(value):
    match = VERSION.fullmatch(value)
    if not match:
        raise Rejected(400, 'Invalid version')
    major, minor, patch, stage, number = match.groups()
    return (int(major), int(minor), int(patch),
            {'alpha': 0, 'beta': 1, 'rc': 2, None: 3}[stage], int(number or 0))


def validate_request(body):
    if not isinstance(body, dict) or set(body) != {'request_id', 'version', 'digest'}:
        raise Rejected(400, 'Expected request_id, version and digest')
    if not all(isinstance(v, str) for v in body.values()):
        raise Rejected(400, 'Expected string values')
    version_key(body['version'])
    if not IDENTIFIER.fullmatch(body['request_id']) or not DIGEST.fullmatch(body['digest']):
        raise Rejected(400, 'Invalid request identity')
    return dict(body)


def signature(secret, method, path, timestamp, nonce, body):
    canonical = '\n'.join([method, path, timestamp, nonce, hashlib.sha256(body).hexdigest()])
    return hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()


def atomic_json(path, value):
    temporary = path.with_suffix('.tmp')
    with temporary.open('w') as output:
        json.dump(value, output, indent=2)
        output.flush()
        os.fsync(output.fileno())
    os.replace(str(temporary), str(path))
    descriptor = os.open(str(path.parent), os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


class Host:
    def __init__(self, config):
        self.config = config
        self.root = pathlib.Path(config['app_dir']).resolve()
        self.compose_file = self.root / 'compose.yml'
        self.compose = ['docker', 'compose', '-p', 'nocoreach', '-f', str(self.compose_file)]
        self.log = None
        self.minimum = config.get('minimum_free_bytes', 3 * 1024 ** 3)

    def run(self, args, timeout=300, output=None):
        result = subprocess.run(args, stdout=output or subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=timeout)
        if self.log:
            previous = self.log.read_bytes() if self.log.exists() else b''
            content = (result.stdout if output is None else b'') + result.stderr
            self.log.write_bytes((previous + content)[-2 * 1024 * 1024:])
        if result.returncode:
            raise RuntimeError('Deployment command failed')
        return result.stdout if output is None else b''

    def inspect(self, ref):
        return json.loads(self.run(['docker', 'image', 'inspect', ref]))[0]

    def current(self):
        container = json.loads(self.run(['docker', 'inspect', 'nocoreach-app']))[0]
        image = self.inspect(container['Image'])
        labels = image['Config'].get('Labels') or {}
        version = labels.get('org.opencontainers.image.version', '')
        version_key(version)
        refs = [r for r in image.get('RepoDigests', []) if r.startswith(REPOSITORY + '@')]
        if len(refs) != 1:
            raise RuntimeError('Cannot identify current application digest')
        return {'version': version, 'digest': refs[0].split('@')[1], 'image_id': image['Id']}

    def space(self, reserve=0):
        if shutil.disk_usage(str(self.root)).free < self.minimum + reserve:
            raise RuntimeError('Insufficient disk space')

    def pull(self, job):
        self.space()
        ref = REPOSITORY + '@' + job['digest']
        self.run(['docker', 'pull', ref], timeout=900)
        image = self.inspect(ref)
        labels = image['Config'].get('Labels') or {}
        if (labels.get('org.opencontainers.image.version') != job['version'] or
                labels.get('org.opencontainers.image.source') != 'https://github.com/nocobase/NocoReach' or
                image['Architecture'] != 'amd64' or image['Os'] != 'linux'):
            raise RuntimeError('Image identity mismatch')
        return image['Id']

    def stop(self):
        self.run(self.compose + ['stop', '-t', '60', 'app'], timeout=120)

    def backup(self, directory):
        size = int(self.run(['docker', 'exec', 'deploy-postgres-1', 'psql', '-X',
                             '-U', 'nocoreach', '-d', 'nocoreach', '-Atc',
                             'SELECT pg_database_size(current_database())']))
        storage = sum(p.stat().st_size for p in (self.root / 'storage').rglob('*') if p.is_file())
        self.space(size + storage)
        directory.mkdir(mode=0o700)
        shutil.copy2(str(self.compose_file), str(directory / 'compose.before.yml'))
        with (directory / 'database.dump').open('wb') as output:
            self.run(['docker', 'exec', 'deploy-postgres-1', 'pg_dump', '-U', 'nocoreach',
                      '-d', 'nocoreach', '-Fc', '--no-owner', '--no-privileges'], timeout=900, output=output)
        with (directory / 'database.dump').open('rb') as source:
            result = subprocess.run(['docker', 'exec', '-i', 'deploy-postgres-1',
                                     'pg_restore', '--file=/dev/null'], stdin=source,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=120)
            if result.returncode:
                raise RuntimeError('Backup validation failed')
        self.run(['tar', '-czf', str(directory / 'files.tar.gz'), '-C', str(self.root),
                  'config.yml', 'storage'], timeout=900)
        self.run(['tar', '-tzf', str(directory / 'files.tar.gz')], timeout=120)
        atomic_json(directory / 'complete.json', {'complete': True})

    def select(self, digest):
        if not DIGEST.fullmatch(digest):
            raise RuntimeError('Invalid selected image')
        original = self.compose_file.read_text()
        replacement, count = re.subn(r'(?m)^(    image:) .*$',
                                     r'\1 ' + REPOSITORY + '@' + digest, original)
        if count != 1:
            raise RuntimeError('Unexpected Compose layout')
        temporary = self.compose_file.with_suffix('.tmp')
        temporary.write_text(replacement)
        os.replace(str(temporary), str(self.compose_file))
        self.run(self.compose + ['config', '--quiet'])

    def cli(self, *args):
        try:
            return json.loads(self.run(self.compose + ['run', '--rm', '--no-deps', '-T',
                                                       '--name', 'nocoreach-deploy-cli', 'app',
                                                       'node', 'dist/cli/index.js'] + list(args), timeout=600))
        finally:
            subprocess.run(['docker', 'rm', '-f', 'nocoreach-deploy-cli'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)

    def preview(self):
        result = self.cli('config', 'check', '--json')
        if not result.get('ok'):
            raise RuntimeError('Configuration check failed')
        repair = self.cli('db', 'repair', '--dry-run', '--json')
        if not repair.get('ok') or any(p['tasks'] for p in repair['result']['plan']):
            raise RuntimeError('Checksum repair requires review')
        apply = self.cli('db', 'apply', '--dry-run', '--json')
        if not apply.get('ok'):
            raise RuntimeError('Migration preview failed')
        return any(p['tasks'] for p in apply['result']['plan'])

    def migrate(self):
        if not self.cli('db', 'apply', '--json').get('ok'):
            raise RuntimeError('Migration failed')

    def start(self):
        self.run(self.compose + ['up', '-d', '--no-deps', 'app'], timeout=120)

    def healthy(self, digest):
        deadline = time.monotonic() + self.config.get('health_timeout', 180)
        while time.monotonic() < deadline:
            try:
                container = json.loads(self.run(['docker', 'inspect', 'nocoreach-app']))[0]
                expected = self.inspect(REPOSITORY + '@' + digest)['Id']
                if (container['Image'] != expected or container['State'].get('OOMKilled') or
                        container['State'].get('Health', {}).get('Status') != 'healthy'):
                    raise RuntimeError('Container not healthy')
                for url in [self.config['local_health'], self.config['public_health']]:
                    with urllib.request.urlopen(url, timeout=10) as response:
                        result = json.load(response)
                    if result.get('ok') is not True or result.get('basePath') != '/main':
                        raise RuntimeError('Unexpected health response')
                return
            except Exception:
                time.sleep(3)
        raise RuntimeError('Health verification timed out')

    def cleanup(self, state):
        keep = {state['current']['digest']}
        if state.get('previous'):
            keep.add(state['previous']['digest'])
        for job in state['jobs'].values():
            if job['status'] in ('failed', 'manual_recovery') and not job.get('superseded'):
                keep.add(job['digest'])
        removed = []
        ids = self.run(['docker', 'ps', '-aq']).decode().split()
        used = set()
        if ids:
            used = {c['Image'] for c in json.loads(self.run(['docker', 'inspect'] + ids))}
        protected_ids = {v for k, v in state['images'].items() if k in keep}
        for digest, image_id in list(state['images'].items()):
            if digest in keep or image_id in used or image_id in protected_ids:
                continue
            try:
                image = self.inspect(image_id)
                tags = image.get('RepoTags') or []
                refs = image.get('RepoDigests') or []
                if any(not t.startswith(REPOSITORY + ':') for t in tags):
                    continue
                if any(not r.startswith(REPOSITORY + '@') for r in refs):
                    continue
                targets = tags or refs or [image_id]
                for ref in targets:
                    self.run(['docker', 'image', 'rm', ref])
                removed.append(digest)
                del state['images'][digest]
            except Exception:
                continue
        successes = sorted([j for j in state['jobs'].values()
                            if j['status'] == 'succeeded' and j.get('backup')],
                           key=lambda j: j['created'], reverse=True)
        removed_backups = []
        for job in successes[3:]:
            directory = pathlib.Path(self.config['state_dir']) / 'backups' / job['id']
            if directory.is_dir():
                shutil.rmtree(str(directory))
                removed_backups.append(job['id'])
                job['backup_removed'] = True
        completed = sorted([j for j in state['jobs'].values()
                            if j['status'] == 'succeeded' or j.get('superseded')],
                           key=lambda j: j['created'], reverse=True)
        for job in completed[20:]:
            log = pathlib.Path(self.config['state_dir']) / (job['id'] + '.log')
            if log.is_file():
                log.unlink()
        return {'images': removed, 'backups': removed_backups,
                'free_bytes': shutil.disk_usage(str(self.root)).free}


class Deployer:
    def __init__(self, config, host=None):
        self.config = config
        self.host = host or Host(config)
        self.root = pathlib.Path(config['state_dir'])
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        (self.root / 'backups').mkdir(mode=0o700, exist_ok=True)
        self.path = self.root / 'state.json'
        self.lock = threading.RLock()
        self.state = json.loads(self.path.read_text()) if self.path.exists() else {
            'current': self.host.current(), 'previous': None, 'jobs': {}, 'nonces': {}, 'images': {}}
        current = self.state['current']
        self.state['images'][current['digest']] = current['image_id']
        for job in self.state['jobs'].values():
            if job['status'] not in TERMINAL:
                job.update(status='manual_recovery', error='Service interrupted; operator review required')
        self.save()

    def save(self):
        atomic_json(self.path, self.state)

    def authenticate(self, method, path, headers, body, now=None):
        now = int(time.time()) if now is None else now
        timestamp, nonce = headers.get('X-Deploy-Timestamp', ''), headers.get('X-Deploy-Nonce', '')
        signed = headers.get('X-Deploy-Signature', '')
        if not re.fullmatch(r'[0-9]{10}', timestamp) or abs(now - int(timestamp)) > 300:
            raise Rejected(401, 'Invalid authentication')
        if not re.fullmatch(r'[0-9a-f]{32}', nonce):
            raise Rejected(401, 'Invalid authentication')
        expected = signature(self.config['secret'], method, path, timestamp, nonce, body)
        if not hmac.compare_digest(expected, signed):
            raise Rejected(401, 'Invalid authentication')
        with self.lock:
            if nonce in self.state['nonces']:
                raise Rejected(409, 'Request replayed')
            self.state['nonces'] = {k: v for k, v in self.state['nonces'].items() if v >= now - 600}
            self.state['nonces'][nonce] = now
            self.save()

    def public_job(self, job):
        return {k: v for k, v in job.items() if k in
                ('id', 'version', 'digest', 'status', 'stage', 'error', 'created', 'cleanup', 'noop')}

    def submit(self, body, launch=True):
        body = validate_request(body)
        with self.lock:
            old = self.state['jobs'].get(body['request_id'])
            if old:
                if old['digest'] != body['digest'] or old['version'] != body['version']:
                    raise Rejected(409, 'Request identity reused with different release')
                return self.public_job(old)
            if any(j['status'] not in ('succeeded', 'failed') for j in self.state['jobs'].values()):
                raise Rejected(409, 'Another deployment or recovery is pending')
            current = self.state['current']
            if version_key(body['version']) < version_key(current['version']):
                raise Rejected(409, 'Older release rejected')
            if body['version'] == current['version'] and body['digest'] != current['digest']:
                raise Rejected(409, 'Version already deployed with another digest')
            job = dict(body, id=body['request_id'], status='queued', stage='queued', created=time.time())
            self.state['jobs'][job['id']] = job
            self.save()
            if launch:
                threading.Thread(target=self.execute, args=(job['id'],), daemon=True).start()
            return self.public_job(job)

    def stage(self, job, name, **values):
        with self.lock:
            job.update(stage=name, **values)
            self.save()

    def execute(self, identifier):
        job = self.state['jobs'][identifier]
        self.host.log = self.root / (identifier + '.log')
        stopped, changed = False, False
        old = dict(self.state['current'])
        try:
            self.stage(job, 'checking', status='running')
            actual = self.host.current()
            if actual['digest'] != old['digest']:
                self.stage(job, 'blocked', status='manual_recovery', error='Running image differs from deployment record')
                return
            if job['digest'] == old['digest']:
                self.host.healthy(old['digest'])
                self.stage(job, 'complete', status='succeeded', noop=True)
                return
            self.stage(job, 'cleanup-before-pull')
            with self.lock:
                job['cleanup'] = self.host.cleanup(self.state)
                self.save()
            self.stage(job, 'pulling')
            image_id = self.host.pull(job)
            with self.lock:
                self.state['images'][job['digest']] = image_id
                self.save()
            self.stage(job, 'stopping')
            stopped = True
            self.host.stop()
            self.stage(job, 'backing-up')
            self.host.backup(self.root / 'backups' / identifier)
            self.stage(job, 'preflight', backup=True)
            self.host.select(job['digest'])
            pending = self.host.preview()
            if pending:
                changed = True
                self.stage(job, 'migrating', database_may_have_changed=True)
                self.host.migrate()
            self.stage(job, 'starting')
            self.host.start()
            self.stage(job, 'verifying')
            self.host.healthy(job['digest'])
            with self.lock:
                self.state['previous'] = old
                self.state['current'] = {'version': job['version'], 'digest': job['digest'], 'image_id': image_id}
                for previous in self.state['jobs'].values():
                    if previous['status'] == 'failed':
                        previous['superseded'] = True
                job.update(status='succeeded', stage='complete')
                self.save()
                try:
                    job['cleanup'] = self.host.cleanup(self.state)
                except Exception:
                    job['cleanup'] = {'warning': 'Cleanup incomplete; retained artifacts require inspection'}
                self.save()
        except Exception:
            failed_stage = job['stage']
            status = 'failed'
            if stopped:
                try:
                    if changed:
                        self.host.stop()
                        status = 'manual_recovery'
                    else:
                        self.host.select(old['digest'])
                        self.host.start()
                        self.host.healthy(old['digest'])
                except Exception:
                    status = 'manual_recovery'
            self.stage(job, failed_stage, status=status,
                       error='Failed at ' + failed_stage + ('; operator recovery required' if status == 'manual_recovery' else ''))


class Server(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    slots = threading.BoundedSemaphore(8)

    def process_request(self, request, address):
        if not self.slots.acquire(False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, *args):
        pass

    def do_POST(self):
        self.handle_request()

    def do_GET(self):
        self.handle_request()

    def handle_request(self):
        try:
            if self.headers.get('Transfer-Encoding'):
                raise Rejected(400, 'Unsupported transfer encoding')
            size = int(self.headers.get('Content-Length', '0'))
            if size < 0 or size > 4096:
                raise Rejected(413, 'Request too large')
            body = self.rfile.read(size)
            if len(body) != size:
                raise Rejected(400, 'Incomplete request')
            deployer = self.server.deployer
            deployer.authenticate(self.command, self.path, self.headers, body)
            if self.command == 'POST' and self.path == PREFIX:
                result = deployer.submit(json.loads(body))
                status = 202
            elif self.command == 'GET' and self.path.startswith(PREFIX + '/'):
                identifier = self.path[len(PREFIX) + 1:]
                if not IDENTIFIER.fullmatch(identifier):
                    raise Rejected(404, 'Not found')
                with deployer.lock:
                    job = deployer.state['jobs'].get(identifier)
                    if not job:
                        raise Rejected(404, 'Not found')
                    result = deployer.public_job(job)
                status = 200
            else:
                raise Rejected(404, 'Not found')
        except Rejected as error:
            status, result = error.code, {'error': error.message}
        except (ValueError, TypeError, UnicodeError):
            status, result = 400, {'error': 'Invalid request'}
        except Exception:
            status, result = 500, {'error': 'Deployment service error'}
        encoded = json.dumps(result).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def main():
    os.umask(0o077)
    config = json.loads(pathlib.Path(sys.argv[1]).read_text())
    if len(config['secret']) < 64:
        raise RuntimeError('Signing secret too short')
    pathlib.Path(config['state_dir']).mkdir(parents=True, exist_ok=True, mode=0o700)
    lock = open(str(pathlib.Path(config['state_dir']) / 'service.lock'), 'w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    server = Server(('127.0.0.1', config.get('port', 13042)), Handler)
    server.deployer = Deployer(config)
    server.serve_forever()


if __name__ == '__main__':
    main()

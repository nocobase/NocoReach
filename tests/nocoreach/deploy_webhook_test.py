import importlib.util
import json
import pathlib
import tempfile
import unittest
import threading
import urllib.request
import urllib.error
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('deployment', str(ROOT / 'scripts/deploy/service.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
OLD = 'sha256:' + 'a' * 64
NEW = 'sha256:' + 'b' * 64


class FakeHost:
    def __init__(self):
        self.events = []
        self.failure = None
        self.pending = False
        self.log = None
        self.actual = {'version': '1.0.0-beta.76', 'digest': OLD, 'image_id': 'old-image'}

    def event(self, name):
        self.events.append(name)
        if name == self.failure:
            raise RuntimeError('Simulated failure')

    def current(self):
        return self.actual

    def pull(self, job):
        self.event('pull')
        return 'new-image'

    def stop(self):
        self.event('stop')

    def backup(self, directory):
        self.event('backup')

    def select(self, digest):
        self.event('select:' + digest)

    def preview(self):
        self.event('preview')
        return self.pending

    def migrate(self):
        self.event('migrate')

    def start(self):
        self.event('start')

    def healthy(self, digest):
        self.event('health:' + digest)

    def cleanup(self, state):
        self.event('cleanup')
        return {'images': [], 'backups': []}


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.host = FakeHost()
        self.config = {'state_dir': self.temp.name, 'secret': 's' * 64}
        self.service = m.Deployer(self.config, self.host)
        self.body = {'request_id': 'release-test-001', 'version': '1.0.0-beta.77', 'digest': NEW}

    def tearDown(self):
        self.temp.cleanup()

    def execute(self):
        self.service.submit(self.body, launch=False)
        self.service.execute(self.body['request_id'])
        return self.service.state['jobs'][self.body['request_id']]

    def test_http_authentication_and_signed_idempotent_deployment(self):
        server = m.Server(('127.0.0.1', 0), m.Handler)
        server.deployer = self.service
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = 'http://127.0.0.1:' + str(server.server_port)
        try:
            with self.assertRaises(urllib.error.HTTPError) as denied:
                urllib.request.urlopen(base + m.PREFIX + '/release-test-001')
            self.assertEqual(denied.exception.code, 401)
            self.body.update(version='1.0.0-beta.76', digest=OLD)
            body = json.dumps(self.body).encode()
            timestamp = str(int(time.time()))
            nonce = 'b' * 32
            headers = {'X-Deploy-Timestamp': timestamp, 'X-Deploy-Nonce': nonce,
                       'X-Deploy-Signature': m.signature('s' * 64, 'POST', m.PREFIX, timestamp, nonce, body)}
            request = urllib.request.Request(base + m.PREFIX, data=body, headers=headers)
            with urllib.request.urlopen(request) as response:
                result = json.load(response)
                self.assertEqual(response.status, 202)
                self.assertEqual(result['digest'], OLD)
            with self.assertRaises(urllib.error.HTTPError) as replay:
                urllib.request.urlopen(request)
            self.assertEqual(replay.exception.code, 409)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_hmac_replay_expiry_and_tampering(self):
        now = 1793872800
        nonce = 'a' * 32
        body = json.dumps(self.body).encode()
        headers = {'X-Deploy-Timestamp': str(now), 'X-Deploy-Nonce': nonce,
                   'X-Deploy-Signature': m.signature('s' * 64, 'POST', m.PREFIX, str(now), nonce, body)}
        self.service.authenticate('POST', m.PREFIX, headers, body, now)
        for method, path, payload, clock in [('POST', m.PREFIX, body, now),
                                            ('GET', m.PREFIX, body, now),
                                            ('POST', m.PREFIX + '/other', body, now),
                                            ('POST', m.PREFIX, body + b' ', now),
                                            ('POST', m.PREFIX, body, now + 301)]:
            with self.assertRaises(m.Rejected):
                self.service.authenticate(method, path, headers, payload, clock)
        restarted = m.Deployer(self.config, self.host)
        with self.assertRaises(m.Rejected):
            restarted.authenticate('POST', m.PREFIX, headers, body, now)

    def test_rejects_commands_paths_old_versions_and_changed_digest(self):
        invalid = [dict(self.body, command='rm -rf /'), dict(self.body, digest='other/image:latest'),
                   dict(self.body, request_id='../secrets'), dict(self.body, version='1.0.0-beta.9'),
                   dict(self.body, version='1.0.0-beta.76')]
        for body in invalid:
            with self.assertRaises(m.Rejected):
                self.service.submit(body, launch=False)

    def test_idempotency_and_concurrency(self):
        first = self.service.submit(self.body, launch=False)
        self.assertEqual(first, self.service.submit(self.body, launch=False))
        with self.assertRaises(m.Rejected):
            self.service.submit(dict(self.body, request_id='release-test-002'), launch=False)
        with self.assertRaises(m.Rejected):
            self.service.submit(dict(self.body, digest=OLD), launch=False)

    def test_current_digest_verifies_health_without_stopping(self):
        self.body.update(version='1.0.0-beta.76', digest=OLD)
        job = self.execute()
        self.assertTrue(job['noop'])
        self.assertEqual(self.host.events, ['health:' + OLD])

    def test_success_orders_backup_before_migration_and_preserves_previous(self):
        self.host.pending = True
        job = self.execute()
        self.assertEqual(job['status'], 'succeeded')
        self.assertEqual(self.service.state['previous']['digest'], OLD)
        self.assertEqual(self.service.state['current']['digest'], NEW)
        self.assertLess(self.host.events.index('backup'), self.host.events.index('migrate'))
        self.assertLess(self.host.events.index('health:' + NEW), len(self.host.events) - 1)

    def test_backup_and_preflight_failure_restart_old_image(self):
        for failure in ['backup', 'preview']:
            with self.subTest(failure=failure):
                self.host.failure = failure
                self.body['request_id'] += 'x'
                job = self.execute()
                self.assertEqual(job['status'], 'failed')
                self.assertEqual(self.service.state['current']['digest'], OLD)
                self.assertEqual(self.host.events[-3:], ['select:' + OLD, 'start', 'health:' + OLD])

    def test_unmigrated_health_failure_rolls_back(self):
        self.host.failure = 'health:' + NEW
        job = self.execute()
        self.assertEqual(job['status'], 'failed')
        self.assertEqual(self.host.events[-3:], ['select:' + OLD, 'start', 'health:' + OLD])

    def test_migration_failure_never_restores_database_automatically(self):
        self.host.pending = True
        self.host.failure = 'migrate'
        job = self.execute()
        self.assertEqual(job['status'], 'manual_recovery')
        self.assertEqual(self.host.events[-1], 'stop')
        self.assertNotIn('select:' + OLD, self.host.events)
        with self.assertRaises(m.Rejected):
            self.service.submit(dict(self.body, request_id='release-test-002'), launch=False)

    def test_crash_requires_review_and_does_not_reexecute(self):
        self.service.submit(self.body, launch=False)
        restarted = m.Deployer(self.config, self.host)
        self.assertEqual(restarted.state['jobs'][self.body['request_id']]['status'], 'manual_recovery')
        self.assertEqual(self.host.events, [])

    def test_pull_failure_never_stops_application(self):
        self.host.failure = 'pull'
        self.assertEqual(self.execute()['status'], 'failed')
        self.assertNotIn('stop', self.host.events)

    def test_external_image_drift_blocks_update(self):
        self.host.actual = dict(self.host.actual, digest=NEW)
        self.assertEqual(self.execute()['status'], 'manual_recovery')
        self.assertNotIn('stop', self.host.events)

    def test_semantic_version_ordering(self):
        versions = ['1.0.0-alpha.9', '1.0.0-beta.9', '1.0.0-beta.10', '1.0.0-rc.1', '1.0.0', '1.1.0-beta.1']
        self.assertEqual(sorted(reversed(versions), key=m.version_key), versions)

    def test_cleanup_preserves_references_other_apps_and_failed_backups(self):
        root = pathlib.Path(self.temp.name)
        config = dict(self.config, app_dir=str(root))
        host = m.Host(config)
        state = {'current': {'digest': OLD}, 'previous': None,
                 'images': {OLD: 'current', NEW: 'candidate', 'sha256:' + 'c' * 64: 'shared'},
                 'jobs': {}}
        for number in range(5):
            identifier = 'backup-' + str(number)
            (root / 'backups' / identifier).mkdir()
            state['jobs'][identifier] = {'id': identifier, 'status': 'succeeded', 'backup': True, 'created': number}
        failed = root / 'backups' / 'failed-backup'
        failed.mkdir()
        state['jobs']['failed-backup'] = {'id': 'failed-backup', 'status': 'failed', 'digest': NEW, 'backup': True}
        calls = []
        def run(args):
            calls.append(args)
            if args == ['docker', 'ps', '-aq']:
                return b'container\n'
            if args[:2] == ['docker', 'inspect']:
                return json.dumps([{'Image': 'current'}]).encode()
            return b''
        host.run = run
        host.inspect = lambda image: {'RepoTags': ['unrelated/service:stable'], 'RepoDigests': []}
        result = host.cleanup(state)
        self.assertEqual(result['images'], [])
        self.assertEqual(len(result['backups']), 2)
        self.assertTrue(failed.exists())
        self.assertFalse(any('rm' in call for call in calls))

    def test_cleanup_removes_only_tracked_unreferenced_image_without_force(self):
        root = pathlib.Path(self.temp.name)
        host = m.Host(dict(self.config, app_dir=str(root)))
        state = {'current': {'digest': OLD}, 'previous': None, 'images': {OLD: 'current', NEW: 'obsolete'}, 'jobs': {}}
        calls = []
        host.run = lambda args: (calls.append(args) or b'')
        host.inspect = lambda image: {'RepoTags': [m.REPOSITORY + ':1.0.0-beta.75'], 'RepoDigests': [m.REPOSITORY + '@' + NEW]}
        self.assertEqual(host.cleanup(state)['images'], [NEW])
        self.assertFalse(any('--force' in call or '-f' in call or 'prune' in call for call in calls))
        self.assertNotIn(NEW, state['images'])


if __name__ == '__main__':
    unittest.main()

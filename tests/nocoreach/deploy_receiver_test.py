import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('receiver', ROOT / 'scripts/deployment/service.py')
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)


class ReceiverTests(unittest.TestCase):
    def test_select_preserves_database_and_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / 'docker-compose.yaml'
            original = ('services:\n  app:\n    image: ' + receiver.REPOSITORY + '@sha256:' + 'a' * 64 +
                        '\n    volumes:\n      - ./config.yml:/app/config.yml:ro\n'
                        '  postgres:\n    image: registry.cn-shanghai.aliyuncs.com/nocobase/postgres:16\n')
            path.write_text(original)
            host = receiver.Host({'app_dir': directory})
            with patch.object(host, 'run') as run:
                host.select('sha256:' + 'b' * 64)
            self.assertEqual(path.read_text(), original.replace('a' * 64, 'b' * 64))
            run.assert_called_once_with(host.compose + ['config', '--quiet'])
            with self.assertRaises(RuntimeError):
                host.select('sha256:invalid')

    def test_current_uses_migrated_container(self):
        host = receiver.Host({'app_dir': '/home/agents/apps/nocoreach'})
        image = {'Id': 'image-id', 'Config': {'Labels': {'org.opencontainers.image.version': '1.0.0-beta.76'}},
                 'RepoDigests': [receiver.REPOSITORY + '@sha256:' + 'a' * 64]}
        with patch.object(host, 'run', return_value=json.dumps([{'Image': 'image-id'}]).encode()) as run, \
                patch.object(host, 'inspect', return_value=image):
            self.assertEqual(host.current()['version'], '1.0.0-beta.76')
            run.assert_called_once_with(['docker', 'inspect', 'nocoreach-app-1'])

    def test_authentication_rejects_replay_and_wrong_signature(self):
        with tempfile.TemporaryDirectory() as directory:
            class Host:
                def current(self):
                    return {'version': '1.0.0', 'digest': 'sha256:' + 'a' * 64, 'image_id': 'id'}
            deployer = receiver.Deployer({'state_dir': directory, 'secret': 's' * 64}, Host())
            timestamp, nonce = '1794198000', 'a' * 32
            headers = {'X-Deploy-Timestamp': timestamp, 'X-Deploy-Nonce': nonce,
                       'X-Deploy-Signature': receiver.signature('s' * 64, 'GET', receiver.PREFIX, timestamp, nonce, b'')}
            deployer.authenticate('GET', receiver.PREFIX, headers, b'', now=int(timestamp))
            with self.assertRaises(receiver.Rejected) as error:
                deployer.authenticate('GET', receiver.PREFIX, headers, b'', now=int(timestamp))
            self.assertEqual(error.exception.code, 409)
            headers['X-Deploy-Signature'] = 'wrong'
            with self.assertRaises(receiver.Rejected) as error:
                deployer.authenticate('GET', receiver.PREFIX, headers, b'', now=int(timestamp))
            self.assertEqual(error.exception.code, 401)


if __name__ == '__main__':
    unittest.main()

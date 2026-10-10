// @vitest-environment node
import { it, expect } from 'vitest';
import { createServer as createHttps } from 'node:https';
import {
  createServer,
  connect,
  isIP,
  type AddressInfo,
  type Socket,
} from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);

it('serves HTTPS over both SOCKS DNS modes, authenticates, pins IPs, verifies TLS, pools and cancels stalled handshakes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nr-socks-test-'));
  await exec('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    join(dir, 'key.pem'),
    '-out',
    join(dir, 'cert.pem'),
    '-days',
    '1',
    '-subj',
    '/CN=example.com',
    '-addext',
    'subjectAltName=DNS:example.com,DNS:localhost,DNS:proxy-only.invalid',
  ]);
  const key = await readFile(join(dir, 'key.pem'));
  const cert = await readFile(join(dir, 'cert.pem'));
  const requests: {
    path: string;
    host: string;
    sni: string;
    tunnels: number;
  }[] = [];
  const targets: { host: string; port: number }[] = [];
  const credentials: { username: string; password: string }[] = [];
  const sockets = new Set<Socket>();
  const upstream = createHttps({ key, cert }, (req, res) => {
    requests.push({
      path: req.url!,
      host: req.headers.host!,
      sni: (req.socket as Socket & { servername: string }).servername,
      tunnels: targets.length,
    });
    if (req.url === '/redirect')
      res.writeHead(302, { location: '/redirected' });
    res.end(req.url === '/big' ? 'x'.repeat(2048) : '{"ok":true}');
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  const proxy = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let stage = 'greeting';
    let buffered = Buffer.alloc(0);
    const receive = (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (stage === 'greeting') {
        if (buffered.length < 2 || buffered.length < 2 + buffered[1]) return;
        const auth = buffered.subarray(2, 2 + buffered[1]).includes(2);
        buffered = buffered.subarray(2 + buffered[1]);
        socket.write(Buffer.from([5, auth ? 2 : 0]));
        stage = auth ? 'auth' : 'request';
      }
      if (stage === 'auth') {
        if (buffered.length < 2) return;
        const userLength = buffered[1];
        if (buffered.length < 3 + userLength) return;
        const passLength = buffered[2 + userLength];
        if (buffered.length < 3 + userLength + passLength) return;
        const username = buffered.subarray(2, 2 + userLength).toString();
        const password = buffered
          .subarray(3 + userLength, 3 + userLength + passLength)
          .toString();
        credentials.push({ username, password });
        buffered = buffered.subarray(3 + userLength + passLength);
        if (username === 'stall') {
          stage = 'stalled';
          return;
        }
        if (username !== 'alice' || password !== '密:码@secret') {
          socket.end(Buffer.from([1, 1]));
          stage = 'rejected';
          return;
        }
        socket.write(Buffer.from([1, 0]));
        stage = 'request';
      }
      if (stage !== 'request' || buffered.length < 5) return;
      const type = buffered[3];
      const offset = type === 3 ? 5 : 4;
      const length = type === 3 ? buffered[4] : type === 1 ? 4 : 16;
      if (buffered.length < offset + length + 2) return;
      const address = buffered.subarray(offset, offset + length);
      const host =
        type === 3
          ? address.toString()
          : type === 1
            ? [...address].join('.')
            : Array.from({ length: 8 }, (_, i) =>
                address.readUInt16BE(i * 2).toString(16),
              ).join(':');
      targets.push({ host, port: buffered.readUInt16BE(offset + length) });
      const head = buffered.subarray(offset + length + 2);
      stage = 'tunnel';
      socket.removeListener('data', receive);
      const remote = connect(
        (upstream.address() as AddressInfo).port,
        '127.0.0.1',
        () => {
          socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 80]));
          if (head.length) remote.write(head);
          socket.pipe(remote);
          remote.pipe(socket);
        },
      );
      remote.on('error', () => socket.destroy());
      socket.on('close', () => remote.destroy());
    };
    socket.on('data', receive);
  });
  await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
  const port = (proxy.address() as AddressInfo).port;
  const script = `
    import assert from 'node:assert/strict';
    import { OutboundNetwork } from './server/nocoreach/outbound-network.ts';
    const p = { id: 'test', revision: 1, url: 'socks5h://127.0.0.1:${port}', username: 'alice', password: '密:码@secret' };
    const n = new OutboundNetwork({ resolve: () => p });
    const check = async (response) => assert.equal((await response.json()).ok, true);
    try {
      await check(await n.send(p, 'https://proxy-only.invalid/remote'));
      await check(await n.send({ ...p, url: p.url.replace('socks5h:', 'socks5:') }, 'https://localhost/local'));
      await assert.rejects(n.send({ ...p, url: p.url.replace('socks5h:', 'socks5:') }, 'https://proxy-only.invalid/'), { code: 'ENOTFOUND' });
      for (const protocol of ['socks5:', 'socks5h:']) {
        await check(await n.send({ ...p, url: p.url.replace('socks5h:', protocol) }, 'https://example.com/pinned-' + protocol, {}, { address: '93.184.216.34', hostname: 'example.com' }));
      }
      await check(await n.send({ ...p, username: '', password: '' }, 'https://proxy-only.invalid/no-auth'));
      await check(await n.send(p, 'https://proxy-only.invalid/redirect'));
      await assert.rejects(n.send(p, 'https://proxy-only.invalid/big', {}, undefined, 100), { code: 'NR_RESPONSE_TOO_LARGE' });
      await assert.rejects(n.send({ ...p, password: 'wrong-secret' }, 'https://proxy-only.invalid/'), (e) => e.message.includes('未切换直连') && !JSON.stringify(e).includes('wrong-secret'));
      await assert.rejects(n.send(p, 'https://wrong.invalid/'), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
      for (let i = 0; i < 10; i++) await check(await n.fetch('github', 'https://proxy-only.invalid/pool-' + i, {}, '1'));
      const started = Date.now();
      await assert.rejects(n.send({ ...p, username: 'stall' }, 'https://proxy-only.invalid/', { signal: AbortSignal.timeout(100) }));
      assert.ok(Date.now() - started < 2000, 'abort did not close the pending handshake');
      await assert.rejects(n.send({ ...p, username: 'stall' }, 'https://proxy-only.invalid/', { signal: AbortSignal.timeout(15000) }), { code: 'UND_ERR_CONNECT_TIMEOUT' });
    } finally { await n.close(); }
    const stopping = new OutboundNetwork({ resolve: () => ({ ...p, username: 'stall' }) });
    const work = assert.rejects(stopping.fetch('github', 'https://proxy-only.invalid/', {}, '1'));
    await new Promise(r => setTimeout(r, 100));
    const stopped = Date.now();
    await stopping.close();
    await work;
    assert.ok(Date.now() - stopped < 2000, 'shutdown waited on a handshake');
    console.log('passed');
  `;
  try {
    const { stdout } = await exec(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_EXTRA_CA_CERTS: join(dir, 'cert.pem') },
        timeout: 20000,
      },
    );
    expect(stdout).toContain('passed');
    expect(targets[0]).toEqual({ host: 'proxy-only.invalid', port: 443 });
    expect(isIP(targets[1].host)).not.toBe(0);
    expect(targets[2]).toEqual({ host: '93.184.216.34', port: 443 });
    expect(targets[3]).toEqual({ host: '93.184.216.34', port: 443 });
    expect(requests.filter((r) => r.path.startsWith('/pinned'))).toHaveLength(
      2,
    );
    expect(
      requests
        .filter((r) => r.path.startsWith('/pinned'))
        .every((r) => r.host === 'example.com' && r.sni === 'example.com'),
    ).toBe(true);
    expect(
      requests.find((r) => r.path === '/pool-9')!.tunnels -
        requests.find((r) => r.path === '/pool-0')!.tunnels,
    ).toBeLessThan(4);
    expect(credentials).toContainEqual({
      username: 'alice',
      password: '密:码@secret',
    });
    expect(requests.some((r) => r.path === '/redirected')).toBe(true);
  } finally {
    for (const socket of sockets) socket.destroy();
    await Promise.all([
      new Promise<void>((r) => proxy.close(() => r())),
      new Promise<void>((r) => upstream.close(() => r())),
    ]);
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);

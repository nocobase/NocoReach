// @vitest-environment node
import { it, expect } from 'vitest';
import { createServer as createProxy } from 'node:http';
import { createServer as createHttps } from 'node:https';
import { connect } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
const exec = promisify(execFile);
it('tunnels TLS through an authenticated proxy, pins public targets, bounds bodies and never falls back', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nr-proxy-test-'));
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
    'subjectAltName=DNS:example.com',
  ]);
  const key = await readFile(join(dir, 'key.pem')),
    cert = await readFile(join(dir, 'cert.pem'));
  const targets: string[] = [],
    credentials: string[] = [],
    hosts: string[] = [];
  const upstream = createHttps({ key, cert }, (req, res) => {
    hosts.push(req.headers.host!);
    res.end(req.url === '/big' ? 'x'.repeat(2048) : '{"ok":true}');
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  let denied = false;
  const proxy = createProxy();
  proxy.on('connect', (req, socket, head) => {
    targets.push(req.url!);
    credentials.push(String(req.headers['proxy-authorization'] || ''));
    if (
      denied ||
      req.headers['proxy-authorization'] !==
        'Basic ' + Buffer.from('alice:secret').toString('base64')
    ) {
      socket.end(
        'HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n',
      );
      return;
    }
    const remote = connect(
      (upstream.address() as AddressInfo).port,
      '127.0.0.1',
      () => {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) remote.write(head);
        remote.pipe(socket);
        socket.pipe(remote);
      },
    );
    socket.on('error', () => remote.destroy());
    remote.on('error', () => socket.destroy());
    socket.on('close', () => remote.destroy());
  });
  await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
  const script = `import { OutboundNetwork } from './server/nocoreach/outbound-network.ts';
    const n = new OutboundNetwork({});
    const p = {url:'http://127.0.0.1:${(proxy.address() as AddressInfo).port}',username:'alice',password:'secret'};
    const response = await n.send(p,'https://example.com/',{}, {address:'93.184.216.34',hostname:'example.com'});
    if (!(await response.json()).ok) throw Error('response missing');
    await n.send(p,'https://example.com/big',{},undefined,100).then(()=>{throw Error('size limit missing')},e=>{if(!e.message.includes('未切换直连'))throw e});
    await n.send({...p,password:'wrong'},'https://example.com/').then(()=>{throw Error('fallback')},e=>{if(!e.message.includes('未切换直连')||e.message.includes('wrong'))throw e});
    console.log('passed');`;
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
    expect(targets[0]).toBe('93.184.216.34:443');
    expect(hosts[0]).toBe('example.com');
    expect(credentials[0]).toBe(
      'Basic ' + Buffer.from('alice:secret').toString('base64'),
    );
    denied = true;
  } finally {
    await Promise.all([
      new Promise<void>((r) => proxy.close(() => r())),
      new Promise<void>((r) => upstream.close(() => r())),
    ]);
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);

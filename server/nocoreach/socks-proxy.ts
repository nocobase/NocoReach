import { lookup } from 'node:dns/promises';
import { connect, isIP, type Socket } from 'node:net';
import { connect as connectTls } from 'node:tls';
import { SocksClient } from 'socks';
import { Agent } from 'undici';
import type { ProxyProfile } from './proxy-profiles.js';

const hostname = (host: string) => host.replace(/^\[|\]$/g, '');
const failure = (code: string) => Object.assign(new Error(code), { code });

/** Use Undici's bounded pools, with a SOCKS tunnel for each new TLS connection. */
export function socksTransport(
  profile: ProxyProfile,
  pinned?: { hostname: string },
) {
  const proxy = new URL(profile.url);
  const pending = new Set<() => void>();
  let closed = false;
  const dispatcher = new Agent({
    connections: 4,
    connect(options, callback) {
      let socket: Socket | undefined;
      let finished = false;
      const timer = setTimeout(
        () => finish(failure('UND_ERR_CONNECT_TIMEOUT')),
        10000,
      );
      timer.unref();
      const cancel = () => finish(failure('NR_NETWORK_CLOSED'));
      function finish(error?: Error) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        pending.delete(cancel);
        if (error) {
          socket?.destroy();
          callback(error, null);
        } else {
          callback(null, socket!);
        }
      }
      pending.add(cancel);
      if (closed) return cancel();

      void (async () => {
        const originalHost = hostname(options.hostname);
        let targetHost = originalHost;
        // Public downloads already replaced the URL hostname with a checked IP.
        // Never send their original hostname to the proxy for a second DNS lookup.
        if (proxy.protocol === 'socks5:' && !isIP(targetHost))
          targetHost = (await lookup(targetHost)).address;
        if (finished) return;
        const tcp = connect({
          host: hostname(proxy.hostname),
          port: Number(proxy.port || 1080),
        });
        socket = tcp;
        tcp.on('error', finish);
        tcp.once('close', () => finish(failure('NR_SOCKS_CONNECTION_CLOSED')));
        await new Promise<void>((resolve, reject) => {
          tcp.once('connect', resolve);
          tcp.once('error', reject);
          tcp.once('close', () =>
            reject(failure('NR_SOCKS_CONNECTION_CLOSED')),
          );
        });
        if (finished) return;
        await SocksClient.createConnection({
          command: 'connect',
          proxy: {
            host: hostname(proxy.hostname),
            port: Number(proxy.port || 1080),
            type: 5,
            userId: profile.username,
            password: profile.password,
          },
          destination: { host: targetHost, port: Number(options.port || 443) },
          existing_socket: tcp,
          timeout: 10000,
        });
        if (finished) return;
        const tlsHost = hostname(pinned?.hostname ?? originalHost);
        socket = connectTls({
          socket: tcp,
          host: tlsHost,
          servername: isIP(tlsHost) ? undefined : tlsHost,
          ALPNProtocols: ['http/1.1'],
        });
        socket.setNoDelay(true).setKeepAlive(true, 60000);
        socket.once('secureConnect', () => finish());
        socket.on('error', finish);
        socket.once('close', () =>
          finish(failure('NR_SOCKS_CONNECTION_CLOSED')),
        );
      })().catch((error: Error) => finish(error));
    },
  });
  return {
    dispatcher,
    // Undici only owns a socket after the connector callback. Cancel DNS/TCP/SOCKS/TLS
    // establishment explicitly when retiring a one-shot transport or stopping the app.
    cancelPending() {
      closed = true;
      for (const cancel of pending) cancel();
    },
  };
}

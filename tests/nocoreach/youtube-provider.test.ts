import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  YouTubeProvider,
  YouTubeError,
  captionText,
  proxyConfig,
  publicError,
  researchInput,
  runYtDlp,
  videoId,
} from '../../server/nocoreach/youtube-provider.js';
import type { OutboundNetwork } from '../../server/nocoreach/outbound-network.js';

const ID = 'Im69kzhpR3I';
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
  vi.restoreAllMocks();
});
const signal = () => new AbortController().signal;
const network = (profile?: object) =>
  ({ selected: vi.fn(() => profile) }) as unknown as OutboundNetwork;
const info = () => ({
  id: ID,
  title: 'YouTube tutorial',
  channel: 'Google Developers',
  view_count: 123,
  like_count: null,
  upload_date: '20241010',
  subtitles: {
    en: [
      { ext: 'json3', url: 'https://www.youtube.com/api/timedtext?v=' + ID },
    ],
  },
});
async function executable(body: string) {
  const dir = await mkdtemp(join(tmpdir(), 'nr-youtube-test-'));
  dirs.push(dir);
  const path = join(dir, 'mock.cjs');
  await writeFile(path, `#!${process.execPath}\n${body}`, { mode: 0o700 });
  return path;
}

describe('YouTube bounded public provider', () => {
  it('normalizes only video IDs/YouTube video URLs and never passes user URLs through', () => {
    for (const value of [
      ID,
      `https://youtu.be/${ID}?si=share`,
      `https://www.youtube.com/watch?v=${ID}&list=ignore`,
      `https://m.youtube.com/shorts/${ID}`,
    ])
      expect(videoId(value)).toBe(ID);
    for (const value of [
      '/etc/passwd',
      'file:///etc/passwd',
      '--exec=bad',
      `https://youtube.com.evil.com/watch?v=${ID}`,
      `https://user:secret@youtube.com/watch?v=${ID}`,
      `http://youtube.com/watch?v=${ID}`,
      'https://youtube.com/playlist?list=a',
    ])
      expect(() => videoId(value)).toThrow(YouTubeError);
    expect(
      researchInput({ terms: 'NocoBase\nNocoBase', videoUrls: ID }),
    ).toEqual({ terms: ['NocoBase'], videoIds: [ID] });
    for (const input of [
      {},
      { terms: 'x' },
      { terms: ['one', 'two', 'three'] },
      { terms: 'ab\u0000cd' },
    ])
      expect(() => researchInput(input)).toThrow();
  });
  it('uses only the selected project proxy and hides credentials from argv/errors', async () => {
    const proxy = {
      id: '1',
      name: 'test',
      revision: 1,
      updatedAt: '',
      url: 'http://proxy.example:8080',
      username: 'private-user',
      password: 'private-password',
    };
    expect(proxyConfig()).toBe("--proxy ''\n");
    const bin = await executable(
      "let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',()=>console.log(JSON.stringify({args:process.argv.slice(2),input,env:process.env}))); ",
    );
    const result = (await runYtDlp(
      `https://www.youtube.com/watch?v=${ID}`,
      'video',
      { signal: signal(), proxy, executable: bin },
    )) as { args: string[]; input: string; env: Record<string, string> };
    expect(result.args).toContain('--ignore-config');
    expect(result.args).toContain('--no-plugin-dirs');
    expect(result.args).toContain('--no-remote-components');
    expect(result.args.join(' ')).not.toContain('private-password');
    expect(result.input).toContain('private-password');
    expect(result.env).not.toHaveProperty('HTTP_PROXY');
    expect(result.env).not.toHaveProperty('HOME');
  });
  it('rejects command/path injection before launching the process', async () => {
    for (const [target, mode] of [
      ['/etc/passwd', 'video'],
      ['ytsearch500:hello', 'search'],
      ['https://evil.test/a', 'video'],
    ] as const)
      await expect(
        runYtDlp(target, mode, { signal: signal() }),
      ).rejects.toMatchObject({ code: 'invalid_input' });
  });
  it('returns dependency/error classifications without provider diagnostics or secrets', async () => {
    await expect(
      runYtDlp(`https://www.youtube.com/watch?v=${ID}`, 'video', {
        signal: signal(),
        executable: '/does-not-exist/yt-dlp',
      }),
    ).rejects.toMatchObject({ code: 'dependency_missing' });
    const bin = await executable(
      "process.stderr.write('Sign in to confirm you are not a bot private-password');process.exit(1);",
    );
    await expect(
      runYtDlp(`https://www.youtube.com/watch?v=${ID}`, 'video', {
        signal: signal(),
        executable: bin,
      }),
    ).rejects.toMatchObject({
      code: 'access_denied',
      message: expect.not.stringContaining('private-password'),
    });
  });
  it.each([
    ['HTTP Error 401: Unauthorized', 'access_denied'],
    ['HTTP Error 407: Proxy Authentication Required', 'access_denied'],
    ['HTTP Error 429: Too Many Requests', 'access_denied'],
    ['no such option: --no-remote-components', 'tool_error'],
    ['unexpected extractor failure private-password', 'upstream_error'],
    ['HTTP Error 503: Service Unavailable', 'network_error'],
    ['Temporary failure in name resolution', 'network_error'],
    ['Connection reset by peer', 'network_error'],
    ['The read operation timed out', 'timeout'],
  ])(
    'classifies %s without treating permanent failures as transient',
    async (message, code) => {
      const bin = await executable(
        `process.stderr.write(${JSON.stringify(message)});process.exit(1);`,
      );
      await expect(
        runYtDlp(`https://www.youtube.com/watch?v=${ID}`, 'video', {
          signal: signal(),
          executable: bin,
        }),
      ).rejects.toMatchObject({
        code,
        message: expect.not.stringContaining('private-password'),
      });
      expect(publicError(new Error('unknown failure')).code).toBe(
        'upstream_error',
      );
    },
  );
  it('kills a running process on cancellation and rejects oversized output', async () => {
    const bin = await executable('setInterval(()=>{},1000);');
    const controller = new AbortController();
    const pending = runYtDlp(`https://www.youtube.com/watch?v=${ID}`, 'video', {
      signal: controller.signal,
      executable: bin,
    });
    setTimeout(() => controller.abort(), 30);
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    const large = await executable(
      "process.stdout.write('x'.repeat(5*1024*1024));",
    );
    await expect(
      runYtDlp(`https://www.youtube.com/watch?v=${ID}`, 'video', {
        signal: signal(),
        executable: large,
      }),
    ).rejects.toMatchObject({ code: 'output_limit' });
  });
  it('searches at most five results and uses fixed canonical URLs for details', async () => {
    const runner = vi
      .fn()
      .mockResolvedValueOnce({
        entries: [{ id: ID }, { id: ID }, { id: 'bad' }],
      })
      .mockResolvedValueOnce(info());
    const net = network();
    const read = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        events: [{ segs: [{ utf8: 'Actual subtitle text' }] }],
      }),
    });
    const provider = new YouTubeProvider(net, runner, read);
    expect(await provider.search('NocoBase', signal())).toEqual([ID]);
    const result = await provider.video(ID, signal());
    expect(runner.mock.calls[0][0]).toBe('ytsearch5:NocoBase');
    expect(runner.mock.calls[1][0]).toBe(
      `https://www.youtube.com/watch?v=${ID}`,
    );
    expect(net.selected).toHaveBeenCalledWith('youtube');
    expect(result).toMatchObject({
      provider: 'yt-dlp',
      views: 123,
      likes: null,
      comments: null,
      transcript: {
        status: 'manual',
        language: 'en',
        text: 'Actual subtitle text',
      },
    });
    expect(result.fetchedAt).toMatch(/^\d{4}-/);
  });
  it('distinguishes missing, failed and automatic captions; never follows arbitrary subtitle URLs', async () => {
    const read = vi.fn().mockResolvedValue({ text: '' });
    const raw = info();
    const provider = new YouTubeProvider(
      network(),
      vi.fn().mockResolvedValue(raw),
      read,
    );
    expect((await provider.video(ID, signal())).transcript.status).toBe(
      'failed',
    );
    raw.subtitles = {};
    expect((await provider.video(ID, signal())).transcript.status).toBe(
      'missing',
    );
    const auto = {
      ...info(),
      subtitles: {},
      automatic_captions: info().subtitles,
    };
    const autoProvider = new YouTubeProvider(
      network(),
      vi.fn().mockResolvedValue(auto),
      async () => ({
        text: 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello world\n',
      }),
    );
    expect((await autoProvider.video(ID, signal())).transcript).toMatchObject({
      status: 'automatic',
      text: 'Hello world',
    });
    const malicious = {
      ...info(),
      subtitles: { en: [{ ext: 'json3', url: 'http://127.0.0.1/private' }] },
    };
    const blockedRead = vi.fn();
    await new YouTubeProvider(
      network(),
      vi.fn().mockResolvedValue(malicious),
      blockedRead,
    ).video(ID, signal());
    expect(blockedRead).not.toHaveBeenCalled();
  });
  it('deduplicates rolling captions and marks truncation, empty/HTML is not a transcript', () => {
    expect(
      captionText(
        'WEBVTT\n\n00:00 --> 00:01\nhello\nhello world\nhello world\n',
      ),
    ).toEqual({ text: 'hello world', truncated: false });
    expect(
      captionText(
        JSON.stringify({ events: [{ segs: [{ utf8: 'a'.repeat(30001) }] }] }),
      ),
    ).toMatchObject({ truncated: true, text: 'a'.repeat(30000) });
    for (const payload of ['', '<html>Please sign in</html>', '{}'])
      expect(() => captionText(payload)).toThrow();
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  YouTubeProvider,
  YouTubeError,
  captionText,
  researchInput,
  videoId,
} from '../../server/nocoreach/youtube-provider.js';
import type { OutboundNetwork } from '../../server/nocoreach/outbound-network.js';

const ID = 'Im69kzhpR3I';
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

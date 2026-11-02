import { describe, expect, it } from 'vitest';
import {
  YouTubeError,
  researchInput,
  videoId,
} from '../../server/nocoreach/youtube-provider.js';

const ID = 'Im69kzhpR3I';
describe('YouTube input', () => {
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
  });
  it('takes one to five search terms and up to five tracked videos', () => {
    expect(
      researchInput({ terms: 'NocoBase\nNocoBase', videoUrls: ID }),
    ).toEqual({ terms: ['NocoBase'], videoIds: [ID] });
    expect(
      researchInput({ terms: ['one', 'two', 'three', 'four', 'five'] }).terms,
    ).toHaveLength(5);
    const five = Array.from({ length: 5 }, (_, i) => `vid${i}`.padEnd(11, '_'));
    expect(
      researchInput({ terms: 'NocoBase', videoUrls: five }).videoIds,
    ).toEqual(five);
    for (const input of [
      {},
      { terms: '' },
      { terms: 'x' },
      { terms: ['one', 'two', 'three', 'four', 'five', 'six'] },
      { terms: 'ab\u0000cd' },
      { terms: 'NocoBase', videoUrls: [...five, ID] },
      { terms: 'NocoBase', videoUrls: 'https://example.com/video' },
    ])
      expect(() => researchInput(input)).toThrow(YouTubeError);
  });
});

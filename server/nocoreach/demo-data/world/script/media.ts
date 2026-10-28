import type { L } from './types.js';
export interface Media {
  title: L;
  /** Days ago. */
  age: number;
  views: number;
  likes: number;
  comments: number;
  /** Seconds. */
  duration?: number;
  channel?: string;
  description?: L;
  /** Search terms that find it, besides the product name. */
  terms?: readonly string[];
}

export {
  ACME_MEDIA as BILIBILI,
  ACME_MEDIA as XIAOHONGSHU,
  ACME_MEDIA as YOUTUBE,
} from './acme.js';

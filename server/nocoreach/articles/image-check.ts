import { TASK_MEDIA_LIMIT } from '../../../shared/manual-task.js';
import { IMAGE_ACCEPT, imageTypeOf } from '../image-bytes.js';
import type { OutboundNetwork } from '../outbound-network.js';
import { download } from '../public-sources.js';
import { ArticleError } from './provider.js';
import type { ImageCheck } from './delivery.js';

/**
 * An uploaded image's address opened once, as a reader's browser would load it (2026-11-17), before the article is
 * written with it: through the project's website egress with the rules of every public read (public-sources.ts:
 * HTTPS, a public address checked and pinned on every hop, a redirect to a CDN followed). It must answer 200 with an
 * image, by its type or its bytes; a file storage that is not public answers the CMS's sign-in instead.
 */
export function imageCheck(network: OutboundNetwork): ImageCheck {
  return async (project, address) => {
    let read: { body: Buffer; type: string };
    try {
      read = await network.runProject(project, () =>
        download(address, 0, {
          network,
          connection: 'site',
          limit: TASK_MEDIA_LIMIT,
          accept: IMAGE_ACCEPT,
          anyHost: true,
        }),
      );
    } catch (cause) {
      throw Object.assign(
        new ArticleError('image_address_unusable', `${address}: did not open`),
        { cause },
      );
    }
    if (!/^image\//i.test(read.type) && !imageTypeOf(read.body))
      throw new ArticleError(
        'image_address_unusable',
        `${address}: answered ${read.type || 'without a type'}, not an image`,
      );
  };
}

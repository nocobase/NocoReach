// @vitest-environment node
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, test } from 'vitest';
import { ARTICLE_TARGET_PRESETS } from '../../shared/article-publishing.js';
import {
  ArticleDelivery,
  isImageAddress,
  usableImageUrls,
} from '../../server/nocoreach/articles/delivery.js';
import { imageCheck } from '../../server/nocoreach/articles/image-check.js';
import {
  ArticleError,
  errorDetail,
} from '../../server/nocoreach/articles/provider.js';
import { ArticleTargets } from '../../server/nocoreach/articles/targets.js';
import type { LegacyVariables } from '../../server/nocoreach/legacy/variables.js';
import { OutboundNetwork } from '../../server/nocoreach/outbound-network.js';
import { fakeNocoBase } from './article-fakes.js';

// Images published with an article (2026-11-17): every image NocoReach uploaded to the NocoBase CMS was kept there as
// an attachment without its file, at its storage's bare origin (https://static-docs.nocobase.com/).

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);

test('the outbound network sends a form as multipart, file included, not as the text "[object FormData]"', async () => {
  const seen: { type: string; body: string }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      seen.push({
        type: String(req.headers['content-type']),
        body: Buffer.concat(chunks).toString('latin1'),
      });
      res.end('{"data":{}}');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const network = new OutboundNetwork({} as never);
  try {
    const form = new FormData();
    form.set('file', new File([PNG], 'shot.png', { type: 'image/png' }));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/attachments:create`;
    // The transport every CMS request takes (fetch → send), here to a loopback address.
    const response = await network.send(
      undefined,
      url,
      { method: 'POST', body: form },
      undefined,
      undefined,
      false,
      true,
    );
    expect(response.status).toBe(200);
    expect(seen).toHaveLength(1);
    const boundary = seen[0].type.match(
      /^multipart\/form-data; boundary=(.+)$/,
    )?.[1];
    expect(boundary).toBeTruthy();
    expect(seen[0].body).toContain(`--${boundary}`);
    expect(seen[0].body).toContain(
      'Content-Disposition: form-data; name="file"; filename="shot.png"',
    );
    expect(seen[0].body).toContain('Content-Type: image/png');
    expect(seen[0].body).toContain(PNG.toString('latin1'));
    expect(seen[0].body).not.toContain('[object FormData]');
  } finally {
    await network.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

describe('an image uploaded to a NocoBase CMS', () => {
  async function setup() {
    const values = new Map<string, string>();
    const variables = {
      get: (k: string) => values.get(k),
      set: async (k: string, v: string) => values.set(k, v),
      cannotRead: () => false,
    } as unknown as LegacyVariables;
    const cms = fakeNocoBase();
    const targets = new ArticleTargets(variables, () => cms.fetcher);
    await targets.save('1', {
      revision: 0,
      secret: 'cms-key',
      target: {
        ...ARTICLE_TARGET_PRESETS['nocobase-api'],
        id: 'cms',
        name: 'NocoBase CMS',
        baseUrl: 'https://cms.example.com',
      },
    });
    const delivery = new ArticleDelivery(targets, cms.checkImage);
    const upload = () =>
      delivery.uploadImage('1', 'cms', {
        name: 'shot.png',
        type: 'image/png',
        bytes: PNG,
      });
    return { cms, upload };
  }

  test('is at its storage’s address, or at its address on the CMS, once that opens', async () => {
    const { cms, upload } = await setup();
    // A storage that serves its files itself (useOriginalUrl), as static-docs.nocobase.com does.
    cms.state.storage = 'https://static.example.com';
    expect(await upload()).toBe('https://static.example.com/1-shot.png');
    // Its permanent address on the CMS, which NocoBase answers with a path.
    cms.state.storage = '';
    expect(await upload()).toBe(
      'https://cms.example.com/storage/uploads/2-shot.png',
    );
    expect(cms.state.opened).toEqual([
      'https://static.example.com/1-shot.png',
      'https://cms.example.com/storage/uploads/2-shot.png',
    ]);
    // Uploaded into the storage of the body field, as an editor's pasted image is.
    expect(cms.state.uploads[0].params.get('attachmentField')).toBe(
      'articles.content',
    );
  });

  test('a record without its file, or an address that does not open, is refused', async () => {
    const { cms, upload } = await setup();
    cms.state.storage = 'https://static.example.com';
    cms.state.dropFiles = true;
    const bare = await upload().catch((e: unknown) => e);
    expect(bare).toBeInstanceOf(ArticleError);
    expect(bare).toMatchObject({
      code: 'image_address_unusable',
      message: 'https://static.example.com/: not the address of a file',
    });
    expect(cms.state.opened).toEqual([]);
    cms.state.dropFiles = false;
    cms.state.closed = true;
    await expect(upload()).rejects.toMatchObject({
      code: 'image_address_unusable',
      message: 'https://static.example.com/2-shot.png: did not open',
    });
  });
});

test('an address kept for an image counts only when it can name a file', () => {
  for (const address of [
    'https://static-docs.nocobase.com/image-fhw6xz.png',
    'https://cms.example.com/files/main/main/attachments/12.png',
    'https://cms.example.com/files/main/main/attachments/12',
  ])
    expect(isImageAddress(address)).toBe(true);
  for (const address of [
    'https://static-docs.nocobase.com/',
    'https://static-docs.nocobase.com',
    'https://static.example.com/uploads/',
    '/storage/uploads/1-shot.png',
    'javascript:alert(1)',
    '',
    null,
  ])
    expect(isImageAddress(address)).toBe(false);
  expect(
    usableImageUrls({
      a: 'https://static-docs.nocobase.com/',
      b: 'https://static-docs.nocobase.com/image-fhw6xz.png',
    }),
  ).toEqual({ b: 'https://static-docs.nocobase.com/image-fhw6xz.png' });
  expect(usableImageUrls(undefined)).toEqual({});
});

describe('the image check', () => {
  // The network as a simulated project sees it: public reads come back from fetch (public-sources.ts download).
  function network(answer: () => Response) {
    const asked: { url: string; accept: string; project?: string }[] = [];
    let project: string | undefined;
    const n = {
      simulation: { enabled: true },
      admit: () => {},
      inDemoProject: async () => false,
      runProject: async <T>(id: string, fn: () => T) => {
        project = id;
        try {
          return await fn();
        } finally {
          project = undefined;
        }
      },
      fetch: async (
        connection: string,
        url: URL,
        init: { headers: Record<string, string> },
      ) => {
        expect(connection).toBe('site');
        asked.push({ url: String(url), accept: init.headers.Accept, project });
        return answer();
      },
    };
    return { check: imageCheck(n as unknown as OutboundNetwork), asked };
  }
  const at = 'https://static-docs.nocobase.com/image-fhw6xz.png';

  test('opens the address once through the project’s website egress and takes an image', async () => {
    const png = network(
      () => new Response(PNG, { headers: { 'content-type': 'image/png' } }),
    );
    await png.check('9', at);
    expect(png.asked).toEqual([
      { url: at, accept: expect.stringContaining('image/png'), project: '9' },
    ]);
    // A storage that does not say what it serves, with an image's bytes.
    await network(
      () =>
        new Response(PNG, {
          headers: { 'content-type': 'application/octet-stream' },
        }),
    ).check('9', at);
  });

  test('refuses a sign-in page, a refusal and an address readers cannot reach', async () => {
    const html = network(
      () =>
        new Response('<html>Sign in</html>', {
          headers: { 'content-type': 'text/html' },
        }),
    );
    await expect(html.check('9', at)).rejects.toMatchObject({
      code: 'image_address_unusable',
      message: `${at}: answered text/html, not an image`,
    });
    // The storage's root, as static-docs.nocobase.com answers it.
    const denied = await network(
      () =>
        new Response('<Error>AccessDenied</Error>', {
          status: 403,
          headers: { 'content-type': 'application/xml' },
        }),
    )
      .check('9', 'https://static-docs.nocobase.com/x.png')
      .catch((e: unknown) => e);
    expect(denied).toMatchObject({ code: 'image_address_unusable' });
    expect(errorDetail(denied)).toMatch(
      /^https:\/\/static-docs\.nocobase\.com\/x\.png: did not open ← Error: .*403/,
    );
    // Public reads take HTTPS only.
    const plain = network(() => new Response(PNG));
    await expect(
      plain.check('9', 'http://static.example.com/x.png'),
    ).rejects.toMatchObject({ code: 'image_address_unusable' });
    expect(plain.asked).toEqual([]);
  });
});

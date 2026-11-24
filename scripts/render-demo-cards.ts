/**
 * Renders the demo's carousel card images (server/nocoreach/demo-data/xhs-card-images.json) from the demo drafts, with
 * the card template the Agent is given (shared/xhs-card.ts) and Acme's brand kit, as the Agent would: one screenshot
 * per card at the place's size (1080×1440 for Xiaohongshu, 1080×1350 for Instagram and LinkedIn), kept as WebP, with
 * the colors read from the screenshots as NocoReach reads an Agent's (png-colors.ts). Run it after changing a carousel
 * demo draft or the template:
 *
 *   pnpm exec tsx scripts/render-demo-cards.ts
 *
 * Needs Playwright's Chromium (or CHROMIUM_PATH) and cwebp.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import {
  WORKSHOP_DRAFTS,
  demoCardStyle,
} from '../server/nocoreach/demo-data/workshop-content.js';
import { pngInfo, setColors } from '../server/nocoreach/png-colors.js';
import {
  CARD_SPECS,
  isCarouselForm,
  parseRepurpose,
} from '../shared/repurpose.js';
import { cardTemplate } from '../shared/xhs-card.js';

const OUT = 'server/nocoreach/demo-data/xhs-card-images.json';

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {},
);
const images: Record<
  string,
  Record<string, { images: string[]; colors: string[] }>
> = {};
for (const d of WORKSHOP_DRAFTS) {
  if (!isCarouselForm(d.form)) continue;
  const size = CARD_SPECS[d.form];
  const page = await browser.newPage({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
  });
  for (const lang of ['zh', 'en'] as const) {
    const parsed = parseRepurpose(d.form, d.draft[lang]);
    if (!parsed) throw new Error(`${d.key} ${lang} does not parse`);
    const cards = parsed.pieces
      .filter((p) => p.kind === 'card')
      .map((p) => ({ layout: p.layout, heading: p.heading, text: p.text }));
    const dir = mkdtempSync(join(tmpdir(), 'xhs-demo-'));
    writeFileSync(
      join(dir, 'xhs-card.html'),
      cardTemplate(demoCardStyle(lang), 'cards.js', size),
    );
    writeFileSync(
      join(dir, 'cards.js'),
      `window.CARDS = ${JSON.stringify(cards)};\n`,
    );
    const list: string[] = [],
      colors: string[][] = [];
    for (let n = 1; n <= cards.length; n++) {
      await page.goto(`file://${join(dir, 'xhs-card.html')}?n=${n}`);
      await page.waitForFunction(() => !document.title.endsWith('pending'));
      const png = join(dir, `${n}.png`),
        webp = join(dir, `${n}.webp`);
      await page.screenshot({ path: png });
      colors.push(pngInfo(readFileSync(png))?.colors ?? []);
      execFileSync('cwebp', ['-quiet', '-q', '75', '-m', '6', png, '-o', webp]);
      list.push(readFileSync(webp).toString('base64'));
      process.stdout.write(
        `${d.key} ${lang} ${n}: ${await page.title()}, ${readFileSync(webp).length} bytes\n`,
      );
    }
    (images[d.key] ||= {})[lang] = { images: list, colors: setColors(colors) };
  }
  await page.close();
}
await browser.close();
writeFileSync(OUT, `${JSON.stringify(images)}\n`);

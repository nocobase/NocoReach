import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../../apps/portal/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const browser = await chromium.launch({ headless: true, executablePath: process.env.NR_CHROMIUM_PATH });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [1440, 390]) for (const dark of [false, true]) for (const compact of [false, true]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:14320/tests/m0/?${dark ? 'dark&' : ''}${compact ? 'compact' : ''}`);
    await expect(page.getByRole('heading', { name: '准备产品介绍文案' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() => {
      const aside = document.querySelector('aside');
      const content = document.querySelector('[data-reach-aside-content]');
      return { width: aside.getBoundingClientRect().width, sticky: getComputedStyle(content).position, overflow: document.documentElement.scrollWidth > innerWidth, rem: parseFloat(getComputedStyle(document.documentElement).fontSize) };
    });
    assert.equal(geometry.overflow, false);
    if (width > 1024) {
      assert.ok(Math.abs(geometry.width - geometry.rem * 20) < 1);
      assert.equal(geometry.sticky, 'sticky');
      const before = await page.locator('[data-reach-aside-content]').boundingBox();
      await page.locator('[data-scroll]').evaluate(el => el.scrollTop = 600);
      const after = await page.locator('[data-reach-aside-content]').boundingBox();
      assert.ok(Math.abs(after.y - before.y) < 1);
    } else assert.equal(geometry.sticky, 'static');
    await page.locator('[data-scroll]').evaluate(el => el.scrollTop = 0);
    await page.screenshot({ path: `/tmp/nocoreach-m0-${width}-${dark ? 'dark' : 'light'}-${compact ? 'compact' : 'default'}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:14320/tests/m0/?tall');
  await expect(page.locator('[data-reach-aside-content]')).toHaveCSS('position', 'static');
  await page.locator('[data-scroll]').evaluate(el => el.scrollTop = el.scrollHeight);
  await expect(page.getByText('扩展属性 30', { exact: true })).toBeInViewport();
  assert.deepEqual(errors, []);
  console.log('PASS: 8 width/theme/density combinations; 20rem aside, sticky scroll, tall fallback, no overflow or page errors.');
} finally { await browser.close(); }

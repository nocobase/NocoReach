/* global process, URL, localStorage, Buffer, DataTransfer, File, ClipboardEvent, DragEvent, document, setTimeout, clearTimeout, console */
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire(process.cwd() + '/package.json');
const { chromium } = require('@playwright/test');
const dir = process.env.NOCOREACH_MANUAL_EVIDENCE_DIR;
assert(
  dir,
  'Set NOCOREACH_MANUAL_EVIDENCE_DIR to a writable temporary directory containing valid.webm',
);
const base = process.env.NOCOREACH_MANUAL_TEST_URL?.replace(/\/$/, '');
assert(
  base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname),
  'Only an explicitly selected isolated local app is allowed',
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const evidence = {
  base,
  startup:
    'APP_STORAGE_DIR=<isolated> DB_FILENAME=<isolated> APP_SERVER_PORT=13168 APP_PUBLIC_ORIGIN=http://localhost:13168 pnpm dev',
  browser: [],
  cli: [],
  errors: [],
};
page.on('pageerror', (e) => evidence.errors.push(e.message));
const login = await context.request.post(base + '/api/auth/sign-in/username', {
  headers: { origin: new URL(base).origin },
  data: { username: 'nocobase', password: 'admin123' },
});
assert.equal(login.status(), 200);
const swagger = await context.request.get(base + '/api/swagger');
assert.equal(swagger.status(), 200);
await writeFile(dir + '/swagger.json', JSON.stringify(await swagger.json()));
const projectRes = await context.request.post(
  base + '/api/nocoreach/nrProjects/create',
  {
    headers: { origin: new URL(base).origin },
    data: {
      name: 'PM-368 isolated validation',
      domain: randomUUID() + '.example.test',
      language: 'en-US',
    },
  },
);
assert.equal(projectRes.status(), 200);
const project = (await projectRes.json()).data;
evidence.projectId = String(project.id);
await page.goto(base + '/actions');
await page.evaluate(
  (id) => localStorage.setItem('nocoreach:project', id),
  String(project.id),
);
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6n6AAAAAASUVORK5CYII=',
  'base64',
);
await writeFile(dir + '/pixel.png', png);
const video = await readFile(dir + '/valid.webm');
for (const kind of ['text', 'image', 'video']) {
  await page.goto(base + '/actions');
  await page
    .getByRole('button', { name: /^New task$|^新建任务$/ })
    .first()
    .click();
  await page.waitForURL(base + '/actions/new');
  await page.locator('#manual-task-title').fill('PM-368 browser ' + kind);
  await page
    .locator('#manual-task-description')
    .fill('Manual browser validation\nCompletion: persistent ' + kind);
  if (kind !== 'text') {
    await page.locator('#manual-task-description').evaluate(
      (el, { bytes, type, name }) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([Uint8Array.from(bytes)], name, { type }));
        el.dispatchEvent(
          new ClipboardEvent('paste', {
            clipboardData: transfer,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      {
        bytes: [...(kind === 'image' ? png : video)],
        type: kind === 'image' ? 'image/png' : 'video/webm',
        name: kind === 'image' ? 'pasted.png' : 'pasted.webm',
      },
    );
    await page.getByText(/已上传|Uploaded/, { exact: true }).waitFor();
    if (kind === 'video') {
      await page.locator('input[type=file]').setInputFiles(dir + '/valid.webm');
      await page
        .getByText(/已上传|Uploaded/, { exact: true })
        .nth(1)
        .waitFor();
      await page.locator('#manual-task-description').evaluate(
        (el, bytes) => {
          const transfer = new DataTransfer();
          transfer.items.add(
            new File([Uint8Array.from(bytes)], 'dropped.webm', {
              type: 'video/webm',
            }),
          );
          el.dispatchEvent(
            new DragEvent('drop', {
              dataTransfer: transfer,
              bubbles: true,
              cancelable: true,
            }),
          );
        },
        [...video],
      );
      await page
        .getByText(/已上传|Uploaded/, { exact: true })
        .nth(2)
        .waitFor();
    }
  }
  await page.screenshot({
    path: dir + '/browser-' + kind + '-form.png',
    fullPage: true,
  });
  const response = page.waitForResponse(
    (r) =>
      r.url() === base + '/api/nocoreachTasks' &&
      r.request().method() === 'POST',
  );
  await page.locator('button[form="manual-task-form"]').click();
  const result = await response;
  assert.equal(result.status(), 201);
  const task = (await result.json()).data;
  await page.waitForURL(base + '/actions/' + task.id);
  await page.reload();
  await page.getByText(task.title, { exact: true }).first().waitFor();
  if (kind === 'image') {
    await page.locator('img[alt="pasted.png"]').waitFor();
    assert(
      await page
        .locator('img[alt="pasted.png"]')
        .evaluate((el) => el.complete && el.naturalWidth > 0),
    );
  }
  if (kind === 'video') {
    const media = page.locator('video').first();
    await media.waitFor();
    await page.waitForFunction(
      () => document.querySelector('video')?.readyState >= 2,
    );
    evidence.video = await media.evaluate(async (el) => {
      await el.play();
      await new Promise((r) => setTimeout(r, 250));
      el.pause();
      return {
        duration: el.duration,
        currentTime: el.currentTime,
        videoWidth: el.videoWidth,
        controls: el.controls,
        autoplay: el.autoplay,
      };
    });
    assert(evidence.video.currentTime > 0);
    assert.equal(evidence.video.autoplay, false);
    const range = await context.request.get(
      new URL(await media.getAttribute('src'), base).href,
      { headers: { Range: 'bytes=10-29' } },
    );
    assert.equal(range.status(), 206);
    assert.deepEqual(await range.body(), video.subarray(10, 30));
    evidence.range = {
      status: range.status(),
      contentRange: range.headers()['content-range'],
    };
    evidence.seek = await media.evaluate(
      (el) =>
        new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('seek timeout')),
            5000,
          );
          el.addEventListener(
            'seeked',
            () => {
              clearTimeout(timeout);
              resolve(el.currentTime);
            },
            { once: true },
          );
          el.currentTime = 0.7;
        }),
    );
    assert(evidence.seek >= 0.69);
  }
  const detail = await context.request.post(
    base + '/api/nocoreach/nrTaskWork/get',
    {
      headers: { origin: new URL(base).origin },
      data: { projectId: String(project.id), taskId: task.id },
    },
  );
  assert.equal(detail.status(), 200);
  const persisted = (await detail.json()).data;
  assert.equal(persisted.work.stage, 'plan');
  assert.equal(persisted.work.operations.length, 0);
  evidence.browser.push({
    ...task,
    clipboard: kind === 'text' ? 'none' : 'synthetic ClipboardEvent File input',
    fallbacks: kind === 'video' ? ['file picker', 'drop'] : [],
  });
  await page.screenshot({
    path: dir + '/browser-' + kind + '-reloaded.png',
    fullPage: true,
  });
}
await page.goto(base + '/actions');
await page.getByText('PM-368 browser text', { exact: true }).waitFor();
await page.screenshot({ path: dir + '/browser-list.png', fullPage: true });

// A transient discard failure followed by real server-side deletion must not
// strand the visible draft when its next authorized DELETE returns not-found.
await page
  .getByRole('button', { name: /^New task$|^新建任务$/ })
  .first()
  .click();
await page.locator('#manual-task-title').fill('PM-368 P2 recovered discard');
await page
  .locator('#manual-task-description')
  .fill('Create after background cleanup');
const p2Upload = page.waitForResponse(
  (r) =>
    r.url().includes('/api/nocoreachTasks/media?') &&
    r.request().method() === 'POST',
);
await page.locator('input[type=file]').setInputFiles(dir + '/pixel.png');
const p2File = (await (await p2Upload).json()).data;
await page.getByText(/已上传|Uploaded/, { exact: true }).waitFor();
const p2DeleteUrl = base + '/api/nocoreachTasks/media/' + p2File.id;
await page.route(
  p2DeleteUrl,
  (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          reason: 'INTERNAL_ERROR',
          domain: 'app',
          message: 'Synthetic transient failure',
        },
      }),
    }),
  { times: 1 },
);
await page.getByRole('button', { name: /^Remove$|^移除$/ }).click();
await page.getByRole('alert').waitFor();
assert.equal(await page.getByText('pixel.png', { exact: true }).count(), 1);
const backgroundDelete = await context.request.delete(p2DeleteUrl, {
  headers: { origin: new URL(base).origin },
});
assert.equal(backgroundDelete.status(), 200);
const missingDiscard = page.waitForResponse(
  (r) => r.url() === p2DeleteUrl && r.request().method() === 'DELETE',
);
await page.getByRole('button', { name: /^Remove$|^移除$/ }).click();
assert.equal((await missingDiscard).status(), 404);
await page.getByText('pixel.png', { exact: true }).waitFor({ state: 'hidden' });
assert.equal(await page.getByRole('alert').count(), 0);
await page.screenshot({
  path: dir + '/browser-p2-discard-recovered.png',
  fullPage: true,
});
const recoveredCreate = page.waitForResponse(
  (r) =>
    r.url() === base + '/api/nocoreachTasks' && r.request().method() === 'POST',
);
await page.locator('button[form="manual-task-form"]').click();
const recoveredResponse = await recoveredCreate;
assert.equal(recoveredResponse.status(), 201);
const recoveredTask = (await recoveredResponse.json()).data;
assert.deepEqual(recoveredTask.attachmentIds, []);
await page.waitForURL(base + '/actions/' + recoveredTask.id);
evidence.discardRecovery = {
  initialFailure: 'synthetic HTTP 500 in browser route',
  backgroundDeleteStatus: backgroundDelete.status(),
  retryStatus: 404,
  taskId: recoveredTask.id,
  number: recoveredTask.number,
};
await page.goto(base + '/actions');
await page
  .getByRole('button', { name: /^New task$|^新建任务$/ })
  .first()
  .click();
await page.locator('#manual-task-title').fill('Unsaved history draft');
await page
  .locator('#manual-task-description')
  .fill('Keep this draft on rejected back');
let rejectedDialog = false;
page.once('dialog', async (dialog) => {
  rejectedDialog = true;
  await dialog.dismiss();
});
await page.goBack();
await page.waitForURL(base + '/actions/new');
assert(rejectedDialog);
assert.equal(
  await page.locator('#manual-task-title').inputValue(),
  'Unsaved history draft',
);
await page.waitForTimeout(250);
let acceptedDialog = false;
page.once('dialog', async (dialog) => {
  acceptedDialog = true;
  await dialog.accept();
});
await page.goBack();
await page.waitForURL(base + '/actions');
await page.waitForTimeout(250);
assert(acceptedDialog);
evidence.historyGuard = {
  rejectedBackPreservesDraft: true,
  acceptedBackLeavesForm: true,
};
const keyRes = await context.request.post(base + '/api/auth/api-key/create', {
  headers: { origin: new URL(base).origin },
  data: { name: 'PM-368 isolated CLI', expiresIn: 86400 },
});
assert.equal(keyRes.status(), 200);
const key = (await keyRes.json()).key;
assert.equal(typeof key, 'string');
const cli = (args) => {
  const run = spawnSync(process.cwd() + '/node_modules/.bin/nocoreach', args, {
    encoding: 'utf8',
    env: { ...process.env, NOCOREACH_SERVER: base, NOCOREACH_API_KEY: key },
    timeout: 60000,
  });
  evidence.cli.push({
    args,
    exitCode: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
  });
  return run;
};
const help = cli(['task', 'create', '--help']);
assert.equal(help.status, 0);
assert.match(help.stdout, /description-file/);
await writeFile(
  dir + '/brief.txt',
  'First line\nSecond line: completion criteria\n',
);
for (const fileInput of [false, true]) {
  const args = [
    'task',
    'create',
    '--project',
    String(project.id),
    '--title',
    'PM-368 CLI ' + (fileInput ? 'multiline' : 'text'),
    '--request-id',
    randomUUID(),
    ...(fileInput
      ? ['--description-file', dir + '/brief.txt']
      : ['--description', 'Plain CLI validation']),
    '--json',
  ];
  const run = cli(args);
  assert.equal(run.status, 0);
  const output = JSON.parse(run.stdout);
  const task = output.result.data;
  assert.equal(task.source, 'manual');
  const again = cli(args);
  assert.equal(again.status, 0);
  assert.equal(JSON.parse(again.stdout).result.data.id, task.id);
  const changed = [...args];
  changed[changed.indexOf('--title') + 1] = 'Changed';
  assert.notEqual(cli(changed).status, 0);
  await page.goto(base + '/actions/' + task.id);
  await page.getByText(task.title, { exact: true }).first().waitFor();
  await page.reload();
  await page.getByText(task.title, { exact: true }).first().waitFor();
  await page.screenshot({
    path: dir + '/cli-' + (fileInput ? 'multiline' : 'text') + '.png',
    fullPage: true,
  });
}
assert.notEqual(
  cli([
    'task',
    'create',
    '--project',
    String(project.id),
    '--title',
    '',
    '--description',
    'x',
    '--request-id',
    randomUUID(),
    '--json',
  ]).status,
  0,
);
await writeFile(
  dir + '/runtime-evidence.json',
  JSON.stringify(evidence, null, 2),
);
console.log(
  JSON.stringify({
    browser: evidence.browser.map((t) => ({ id: t.id, number: t.number })),
    cli: evidence.cli.map((c) => ({ args: c.args, exitCode: c.exitCode })),
    video: evidence.video,
    errors: evidence.errors,
  }),
);
await browser.close();

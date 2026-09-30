const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const output = mkdtempSync(path.join(tmpdir(), 'nr-m0-cjs-'));
let EchoReceiver;
try {
  execFileSync(process.execPath, [path.join(root, 'apps/portal/node_modules/typescript/bin/tsc'), '-p', path.join(root, 'prototypes/m0/tsconfig.json'), '--outDir', output]);
  ({ EchoReceiver } = require(path.join(output, 'execution.js')));
} finally { rmSync(output, { recursive: true, force: true }); }
const request = { protocolVersion: 1, projectId: 'demo', taskId: 'task-demo', runId: 'run-demo', planVersion: 1, stepId: 'step-demo', prompt: '合成任务' };
const reply = () => JSON.parse(execFileSync(process.execPath, [path.join(root, 'prototypes/m0/echo-agent.cjs')], { input: JSON.stringify(request), encoding: 'utf8' }));
test('TS compiles to CommonJS; separate echo process returns candidate, never approval', () => {
  const receiver = new EchoReceiver(request), result = reply();
  assert.deepEqual(receiver.receive(result, 1), { runId: request.runId, content: 'echo: 合成任务', review: 'pending' });
  assert.deepEqual(receiver.receive(result, 1), receiver.receive(result, 1));
  assert.throws(() => receiver.receive({ ...result, content: 'overwritten' }, 1), /IDEMPOTENCY_CONFLICT/);
});
test('rejects changed context, stale plan, failed execution and cancelled callbacks', () => {
  const receiver = new EchoReceiver(request), result = reply();
  for (const key of ['protocolVersion', 'projectId', 'taskId', 'runId', 'planVersion', 'stepId', 'prompt']) {
    assert.throws(() => receiver.receive({ ...result, request: { ...request, [key]: 'wrong' } }, 1), /CONTEXT_MISMATCH/);
  }
  assert.throws(() => receiver.receive(result, 2), /STALE_PLAN/);
  assert.throws(() => receiver.receive(result, 1, true), /RUN_CANCELLED/);
  assert.throws(() => receiver.receive({ ...result, exitCode: 1 }, 1), /EXECUTION_FAILED/);
});

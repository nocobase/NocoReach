'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load() {
  let plugin;
  class Plugin { constructor(app) { this.app = app; } }
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../plugins/connections/client/index.js'), 'utf8'), {
    define(name, dependencies, factory) {
      assert.equal(name, '@nocoreach/plugin-connections');
      assert.deepEqual(Array.from(dependencies), ['@nocobase/client']);
      plugin = factory({ Plugin });
    },
  });
  return { plugin, Plugin };
}
test('admin shell can load the connections plugin through AMD without hard workflow dependency', () => {
  const { plugin, Plugin } = load();
  assert.ok(new plugin.default({}) instanceof Plugin);
  assert.equal(plugin.__esModule, true);
});
test('workflow node registers when the workflow client is available, and is skipped otherwise', async () => {
  const { plugin } = load();
  const registered = [];
  class Base {}
  const workflow = { registerInstruction: (type, C) => registered.push({ type, instance: new C() }) };
  const app = (rq, wf = workflow) => ({ pm: { get: (n) => (n === 'workflow' ? wf : null) }, requirejs: { requirejs: rq } });
  await new plugin.default(app((deps, ok) => { assert.deepEqual(Array.from(deps), ['@nocobase/plugin-workflow/client-v2']); ok({ Instruction: Base }); })).load();
  assert.equal(registered.length, 1);
  assert.equal(registered[0].type, 'nocoreach-analysis');
  assert.ok(registered[0].instance instanceof Base);
  assert.equal(registered[0].instance.group, 'extended');
  await new plugin.default(app((deps, ok, fail) => fail(new Error('missing')))).load();
  await new plugin.default(app(() => { throw new Error('should not load'); }, null)).load();
  await new plugin.default(app((deps, ok) => ok({}))).load();
  assert.equal(registered.length, 1);
});

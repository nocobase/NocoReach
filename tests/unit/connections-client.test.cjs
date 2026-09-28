'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
test('admin shell can load the server-only connections plugin through AMD', () => {
  let plugin;
  class Plugin {}
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../plugins/connections/client/index.js'), 'utf8'), {
    define(name, dependencies, factory) {
      assert.equal(name, '@nocoreach/plugin-connections');
      assert.deepEqual(Array.from(dependencies), ['@nocobase/client']);
      plugin = factory({ Plugin });
    },
  });
  assert.ok(new plugin.default() instanceof Plugin);
  assert.equal(plugin.__esModule, true);
});

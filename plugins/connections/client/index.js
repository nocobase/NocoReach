// The connections UI lives in the Portal. The admin shell still loads every enabled plugin,
// so this client stays minimal: it only adds the "NocoReach 每日分析" node to the workflow canvas.
// The workflow client is loaded at runtime and skipped when unavailable, so a disabled workflow
// plugin can never break the admin shell.
define('@nocoreach/plugin-connections', ['@nocobase/client'], function (client) {
  'use strict';
  var NODE_TYPE = 'nocoreach-analysis';
  class ConnectionsClientPlugin extends client.Plugin {
    async load() {
      var app = this.app;
      var workflow = app.pm.get('workflow') || app.pm.get('@nocobase/plugin-workflow');
      var rq = (app.requirejs && app.requirejs.requirejs) || (typeof window !== 'undefined' && window.requirejs && window.requirejs.requirejs);
      if (!workflow || typeof workflow.registerInstruction !== 'function' || typeof rq !== 'function') return;
      await new Promise(function (resolve) {
        rq(['@nocobase/plugin-workflow/client-v2'], function (mod) {
          try {
            var Base = mod && mod.Instruction;
            if (typeof Base === 'function') {
              class AnalysisInstruction extends Base {
                constructor() {
                  super();
                  this.title = 'NocoReach 每日分析';
                  this.type = NODE_TYPE;
                  this.group = 'extended';
                  this.description = '计算各数据源的信号，由 AI 写本期观察和建议。无需配置。';
                  this.fieldset = {};
                }
              }
              workflow.registerInstruction(NODE_TYPE, AnalysisInstruction);
            }
          } catch (e) { /* keep the admin shell usable */ }
          resolve();
        }, function () { resolve(); });
      });
    }
  }
  return { __esModule: true, default: ConnectionsClientPlugin };
});

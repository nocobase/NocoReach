import { systemMessageText } from '../../shared/i18n/messages.js';
import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import { projectId, requireAccess } from './policy.js';
import { MOCK_AI_MODEL } from '../../app-plugins/nocoreach-mock/server/ai';
import type { MockEngine } from '../../app-plugins/nocoreach-mock/server/engine';
import type { LegacyApp } from './legacy/app';
import type { legacyContext } from './legacy/context';
type AnalysisRun = { at?: unknown; [key: string]: unknown };

/** Business status only. Models and credentials are managed by the Agents plugin. */
export class OnlineAI {
  constructor(
    private readonly p: {
      agents: Agents;
      app: LegacyApp;
      analysis: { state(project: string): Promise<{ runs?: AnalysisRun[] }> };
      mock?: MockEngine;
    },
  ) {}
  async status(project?: string) {
    if (this.p.mock?.enabled) {
      const settings = project ? this.p.mock.status(project) : null;
      const runs = project
        ? (await this.p.analysis.state(project)).runs || []
        : [];
      return {
        connected: Boolean(settings?.enabled),
        simulated: true,
        model: MOCK_AI_MODEL.model,
        service: {
          name: MOCK_AI_MODEL.llmService,
          title: '模拟 AI / Simulated AI',
          provider: 'synthetic',
          enabled: Boolean(settings?.enabled),
        },
        error: settings?.enabled ? '' : 'NR_MOCK_PROJECT_DISABLED',
        analysis: {
          today:
            runs.find(
              (r: AnalysisRun) =>
                String(r.at).slice(0, 10) ===
                new Date().toISOString().slice(0, 10),
            ) ?? null,
          last: runs[0] ?? null,
        },
      };
    }
    const model = (await this.p.agents.online.services.defaults())
      .effectiveChat;
    const service = model
      ? (await this.p.agents.online.services.list()).find(
          (s) => s.name === model.modelService,
        )
      : null;
    const runs = project
      ? (await this.p.analysis.state(project)).runs || []
      : [];
    return {
      connected: Boolean(model),
      model: model?.model ?? null,
      service: service
        ? {
            name: service.name,
            title: service.title,
            provider: service.provider,
            enabled: service.enabled,
          }
        : null,
      error: model ? '' : systemMessageText('taskExecution.defaultModelRequired'),
      analysis: {
        today:
          runs.find(
            (r: AnalysisRun) =>
              String(r.at).slice(0, 10) ===
              new Date().toISOString().slice(0, 10),
          ) ?? null,
        last: runs[0] ?? null,
      },
    };
  }
  register() {
    this.p.app.resourceManager.define({
      name: 'nrOnlineAI',
      actions: {
        status: async (
          ctx: ReturnType<typeof legacyContext>,
          next: () => Promise<void>,
        ) => {
          await requireAccess(ctx);
          const values = ctx.action.params.values;
          const value =
            values && typeof values === 'object' && 'projectId' in values
              ? values.projectId
              : undefined;
          ctx.body = await this.status(value ? projectId(value) : undefined);
          await next();
        },
      },
    });
    this.p.app.acl.allow('nrOnlineAI', ['status'], 'loggedIn');
  }
}

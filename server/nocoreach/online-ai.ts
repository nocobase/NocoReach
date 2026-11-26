import { systemMessageText } from '../../shared/i18n/messages.js';
import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import { projectId, requireAccess } from './policy.js';
import { MOCK_AI_MODEL } from '../../app-plugins/nocoreach-mock/server/ai';
import type { MockEngine } from '../../app-plugins/nocoreach-mock/server/engine';
import type { LegacyApp } from './legacy/app';
import type { legacyContext } from './legacy/context';
import type { OnlineModel } from '../../shared/online-agent.js';
type AnalysisRun = { at?: unknown; [key: string]: unknown };

/** Business status only. Models and credentials are managed by the Agents plugin. */
export class OnlineAI {
  constructor(
    private readonly p: {
      agents: Agents;
      app: LegacyApp;
      analysis: { state(project: string): Promise<{ runs?: AnalysisRun[] }> };
      mock?: MockEngine;
      editingModel?: {
        get(): Promise<OnlineModel | null>;
        set(model: OnlineModel | null, by: string): Promise<void>;
      };
    },
  ) {}
  /**
   * Editing and suggestions' model (`cloud-models.ts`): its own choice, if any, and the model it runs on, which is the
   * default chat model without a choice. An own model that can no longer answer is reported, not replaced.
   */
  private async editing(fallback: string | null) {
    const choice = (await this.p.editingModel?.get()) ?? null;
    if (this.p.mock?.enabled)
      return { choice, model: MOCK_AI_MODEL.model, available: true };
    let available = true;
    if (choice)
      try {
        await this.p.agents.models.services.connectionFor(choice, 'chat');
      } catch {
        available = false;
      }
    return { choice, model: choice?.model ?? fallback, available };
  }
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
        editing: await this.editing(MOCK_AI_MODEL.model),
      };
    }
    const model = (await this.p.agents.models.services.defaults())
      .effectiveChat;
    const service = model
      ? (await this.p.agents.models.services.list()).find(
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
      error: model
        ? ''
        : systemMessageText('taskExecution.defaultModelRequired'),
      analysis: {
        today:
          runs.find(
            (r: AnalysisRun) =>
              String(r.at).slice(0, 10) ===
              new Date().toISOString().slice(0, 10),
          ) ?? null,
        last: runs[0] ?? null,
      },
      editing: await this.editing(model?.model ?? null),
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
        // The model the daily analysis uses: the Agents plugin's system default chat model, which its pages no longer
        // let anyone change (2026-10-22: lost with the plugin upgrade of 2026-10-16). With `role: 'editing'`, Editing
        // and suggestions' own model instead, or `model: null` to go back to the default; it is checked to answer first,
        // as the chat panel's is. Administrators only (policy.ts).
        setModel: async (
          ctx: ReturnType<typeof legacyContext>,
          next: () => Promise<void>,
        ) => {
          await requireAccess(ctx);
          const values = (ctx.action.params.values ?? {}) as Record<
            string,
            unknown
          >;
          const modelService =
            typeof values.modelService === 'string' ? values.modelService : '';
          const model = typeof values.model === 'string' ? values.model : '';
          const by = String(ctx.auth?.user?.id ?? '');
          if (values.role === 'editing' && values.model === null) {
            await this.p.editingModel!.set(null, by);
          } else {
            if (!modelService || !model)
              ctx.throw(400, systemMessageText('agentRoles.chooseModel'));
            if (values.role === 'editing') {
              try {
                await this.p.agents.models.services.connectionFor(
                  { modelService, model },
                  'chat',
                );
              } catch {
                ctx.throw(
                  400,
                  systemMessageText('onlineAgent.modelUnavailable'),
                );
              }
              await this.p.editingModel!.set({ modelService, model }, by);
            } else
              await this.p.agents.models.services.setDefaultChat(
                { modelService, model },
                by,
              );
          }
          ctx.body = await this.status(
            'projectId' in values && values.projectId
              ? projectId(values.projectId)
              : undefined,
          );
          await next();
        },
      },
    });
    this.p.app.acl.allow('nrOnlineAI', ['status', 'setModel'], 'loggedIn');
  }
}

import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import { projectId, requireAccess } from './policy.js';

/** Business status only. Models and credentials are managed by the Agents plugin. */
export class OnlineAI {
  constructor(private readonly p: { agents: Agents; app: any; analysis: any }) {}
  async status(project?: string) {
    const model = (await this.p.agents.online.services.defaults()).effectiveChat;
    const service = model ? (await this.p.agents.online.services.list()).find(s => s.name === model.modelService) : null;
    const runs = project ? (await this.p.analysis.state(project)).runs || [] : [];
    return {
      connected: Boolean(model), model: model?.model ?? null,
      service: service ? { name: service.name, title: service.title, provider: service.provider, enabled: service.enabled } : null,
      error: model ? '' : '请先在“AI 团队 → 模型”配置默认模型',
      analysis: { today: runs.find((r: any) => String(r.at).slice(0, 10) === new Date().toISOString().slice(0, 10)) ?? null, last: runs[0] ?? null },
    };
  }
  register() {
    this.p.app.resourceManager.define({ name: 'nrOnlineAI', actions: { status: async (ctx: any, next: () => Promise<void>) => {
      await requireAccess(ctx);
      const value = ctx.action.params.values?.projectId;
      ctx.body = await this.status(value ? projectId(value) : undefined);
      await next();
    } } });
    this.p.app.acl.allow('nrOnlineAI', ['status'], 'loggedIn');
  }
}

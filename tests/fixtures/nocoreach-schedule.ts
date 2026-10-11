export const systemSchedule = {
  id: 'system-schedule',
  key: 'nocoreach.daily-analysis',
  title: 'NocoReach 每日分析',
  description:
    '每天运行一次 NocoReach 分析：计算信号并由在线 AI 写本期观察和建议。没跑成的当天会补跑或重试。',
  cron: '0 9 * * *',
  timezone: 'UTC',
  enabled: true,
  lifecycleState: 'active',
  scheduleStatus: 'active',
  targetState: 'ready',
  runCount: 1,
  targetType: 'app.nocoreach.daily-analysis',
  targetSummary: {
    targetLabel: 'NocoReach 每日分析',
    description: '逐个项目计算信号，由在线 AI 写本期观察和建议',
    state: 'ready',
  },
} as const;

export const missingModel = '请先在“AI 团队 → 模型”配置默认模型';
export const missingModelEnglish =
  'Configure a default model under "AI team → Models" first.';
export const unknownError = '上游拒绝：{{name}} {0} 503 / request-测试';
export const systemOccurrence = {
  id: 'system-occurrence',
  scheduleId: systemSchedule.id,
  status: 'failed',
  startedAt: '2026-10-11T09:00:00Z',
  finishedAt: '2026-10-11T09:00:01Z',
  target: { type: systemSchedule.targetType },
  reason: `项目 1：${missingModel}；项目 2：${unknownError}；项目 3：分析失败`,
  resultSummary: {
    projects: {
      '1': { ok: false, error: missingModel },
      '2': { ok: false, error: unknownError },
      '3': { ok: false },
      '4': { ok: true },
    },
  },
};

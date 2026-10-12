/** Display-only compatibility for the code-defined schedule in server/providers/nocoreach.ts. */
export const DAILY_ANALYSIS_KEY = 'nocoreach.daily-analysis';
export const DAILY_ANALYSIS_TARGET = 'app.nocoreach.daily-analysis';

export interface ScheduleSource {
  readonly id: string;
  readonly key?: string;
  readonly targetType: string;
}

interface ScheduleCopy extends ScheduleSource {
  readonly title: string;
  readonly description?: string;
  readonly targetSummary: {
    readonly targetLabel: string;
    readonly description?: string;
  };
}

export interface OccurrenceSource {
  readonly scheduleId?: string;
  readonly reason?: string;
  readonly target?: { readonly type?: string };
  readonly resultSummary?: { readonly projects?: unknown };
}

type Translate = (
  key: string,
  options?: Readonly<Record<string, unknown>>,
) => string;

function isDailyAnalysis(item: ScheduleSource): boolean {
  return (
    item.key === DAILY_ANALYSIS_KEY && item.targetType === DAILY_ANALYSIS_TARGET
  );
}

// An edited field remains data even on the built-in schedule. Never persist this projection.
export function scheduleCopy(item: ScheduleCopy, t: Translate) {
  const known = isDailyAnalysis(item);
  const title = (value: string) =>
    known && value === 'NocoReach 每日分析'
      ? t('page.dailyAnalysis.title')
      : value;
  return {
    title: title(item.title),
    description:
      known &&
      item.description ===
        '每天运行一次 NocoReach 分析：计算信号并由在线 AI 写本期观察和建议。没跑成的当天会补跑或重试。'
        ? t('page.dailyAnalysis.description')
        : item.description,
    targetLabel: title(item.targetSummary.targetLabel),
    targetDescription:
      known &&
      item.targetSummary.description ===
        '逐个项目计算信号，由在线 AI 写本期观察和建议'
        ? t('page.dailyAnalysis.targetDescription')
        : item.targetSummary.description,
  };
}

const knownReasons = new Map([
  ['请先在“AI 团队 → 模型”配置默认模型', 'missingModel'],
  ['项目不存在', 'missingProject'],
  ['每日分析没有注册', 'missingInstruction'],
  ['运行被中断（服务重启）', 'interrupted'],
  ['分析失败', 'failed'],
  ['no-run-record', 'missingRun'],
]);

/** Match the producer's identity and exact stored summary before translating its project wrapper. */
export function scheduleReason(
  schedule: ScheduleSource,
  occurrence: OccurrenceSource,
  t: Translate,
): string | undefined {
  const reason = occurrence.reason;
  if (
    !reason ||
    !isDailyAnalysis(schedule) ||
    occurrence.scheduleId !== schedule.id ||
    occurrence.target?.type !== DAILY_ANALYSIS_TARGET
  )
    return reason;
  const translateKnown = (value: string) => {
    const key = knownReasons.get(value);
    return key ? t(`page.dailyAnalysis.reasons.${key}`) : value;
  };
  if (knownReasons.has(reason)) return translateKnown(reason);
  const projects = occurrence.resultSummary?.projects;
  if (!projects || typeof projects !== 'object' || Array.isArray(projects))
    return reason;
  const failures: { id: string; error: string }[] = [];
  for (const [id, value] of Object.entries(
    projects as Record<string, unknown>,
  )) {
    if (
      !value ||
      typeof value !== 'object' ||
      !('ok' in value) ||
      typeof value.ok !== 'boolean'
    )
      return reason;
    if (value.ok) continue;
    const error: unknown = 'error' in value ? value.error : undefined;
    if (error !== undefined && typeof error !== 'string') return reason;
    failures.push({ id, error: error ?? '分析失败' });
  }
  // Truncated, stale or otherwise unmatched history stays byte-for-byte intact.
  if (
    !failures.length ||
    failures.map(({ id, error }) => `项目 ${id}：${error}`).join('；') !==
      reason
  )
    return reason;
  return failures
    .map(({ id, error }) =>
      t('page.dailyAnalysis.projectFailure', {
        id,
        error: translateKnown(error),
      }),
    )
    .join(t('page.dailyAnalysis.separator'));
}

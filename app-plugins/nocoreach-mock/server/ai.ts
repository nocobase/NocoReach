import { createHash } from 'node:crypto';
import { MockEngine, MockError, mockDelay } from './engine.js';
import type { MockRunContext } from './types.js';

/** Explicit business operations only. Prompt text never selects a provider or an operation. */
export const MOCK_AI_OPERATIONS = [
  'daily-report',
  'daily-judge',
  'daily-judge-many',
  'daily-rewrite',
  'keyword-suggest',
  'ai-question-suggest',
  'knowledge-suggest',
  'memory-draft',
  'memory-check',
  'competitor-suggest',
] as const;
export type MockAiOperation = (typeof MOCK_AI_OPERATIONS)[number];
export const MOCK_AI_MODEL = {
  llmService: 'nocoreach-mock',
  model: 'synthetic-fixture-v1',
} as const;
const LABEL = '【模拟 / Simulated】';
type Value = Record<string, unknown>;
const isObject = (value: unknown): value is Value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const object = (value: unknown): Value => (isObject(value) ? value : {});
const list = (value: unknown): Value[] =>
  Array.isArray(value) ? (value as unknown[]).filter(isObject) : [];
const str = (value: unknown, limit = 400) =>
  typeof value === 'string' ? value.slice(0, limit) : '';
function inputOf(prompt: string): Value {
  // Daily analysis prefixes its JSON with a fixed user-facing sentence. Parse data, never instructions.
  const start = prompt.indexOf('{');
  if (start < 0) throw new MockError('NR_MOCK_AI_INVALID_INPUT', 422);
  try {
    const value: unknown = JSON.parse(prompt.slice(start));
    if (!isObject(value)) throw new Error();
    return value;
  } catch {
    throw new MockError('NR_MOCK_AI_INVALID_INPUT', 422);
  }
}
const review = (signal: Value) => ({
  key: str(signal.key, 200),
  verdict: 'skip',
  reason: '【模拟】仅用于流程验证，不是市场判断',
});
function report(input: Value, ctx: Readonly<MockRunContext>, stamp: string) {
  const signals =
    ctx.scenario === 'empty'
      ? []
      : list(object(object(input.evidence).signals).items);
  const actionable = signals
    .filter((s) => s.actionable === true && typeof s.key === 'string')
    .slice(0, ctx.scenario === 'newdata' ? 3 : 2);
  const cited = new Set(actionable.map((s) => s.key));
  return {
    observations: [
      `${LABEL}固定样例 ${stamp}：收到 ${signals.length} 条输入信号，时间 ${ctx.clock}。`,
      `${LABEL}以下建议用于验证解析、校验和保存流程；未调用真实模型，不能作为业务判断。`,
    ],
    insights: actionable.map((s, i) => ({
      title: `【模拟】复核来源 ${i + 1}`,
      reason: '【模拟】复核 1 条输入信号',
      observation: `${LABEL}输入信号：${str(s.title)}；模拟时间 ${ctx.clock}。`,
      meaning: `${LABEL}固定演示建议，不代表真实模型推断或实际市场结论。`,
      evidenceText: `${LABEL}${JSON.stringify(s.facts ?? {}).slice(0, 2200)}`,
      limitation: `${LABEL}仅供测试；未验证真实效果，未访问外部服务。`,
      suggestion: '【模拟】人工核对这条输入信号，再决定是否创建任务。',
      objective: '【模拟】验证信号到机会的业务流程',
      signalIds: [s.key],
      sources: [str(s.source, 80)].filter(Boolean),
      target: str(s.target || s.page || s.url, 500),
      audience: '【模拟】演示项目成员',
      category: 'market',
      priority: 'low',
      priorityReason: '【模拟】需人工确认',
      confidence: 'verify',
      effort: 'small',
      lifecycle: 'watch',
      source: 'mixed',
    })),
    signalReviews: signals.map((s) =>
      cited.has(s.key)
        ? { key: s.key, verdict: 'do', reason: '【模拟】用于验证建议保存流程' }
        : review(s),
    ),
    sourceReviews: [
      ...new Set(signals.map((s) => str(s.source, 80)).filter(Boolean)),
    ].map((sourceId) => ({
      sourceId,
      result: 'insufficient',
      reason: `${LABEL}固定样例，未进行真实分析。`,
    })),
  };
}
function fixture(
  operation: MockAiOperation,
  input: Value,
  ctx: Readonly<MockRunContext>,
  stamp: string,
): Value {
  const empty = ctx.scenario === 'empty';
  switch (operation) {
    case 'daily-report':
      return report(input, ctx, stamp);
    case 'daily-judge':
      return review(object(input.signal));
    case 'daily-judge-many':
      return { reviews: list(input.signals).map(review) };
    // The normal fixture passes style validation. An explicit rewrite remains a no-op; no live fallback.
    case 'daily-rewrite':
      return { rewrites: [] };
    case 'keyword-suggest':
      return {
        groups: empty
          ? []
          : [
              '产品与功能词',
              '使用场景与问题词',
              '对比与替代词',
              '品类与行业词',
            ].map((name, i) => ({
              name,
              keywords: [
                'demo workflow',
                'demo project dashboard',
                'demo reporting',
                'demo analytics',
              ]
                .slice(i, i + 1)
                .map((keyword) => ({
                  keyword,
                  intent: 'informational',
                  reason: `${LABEL}固定测试关键词 ${stamp}`,
                  page: str(
                    list(input.pages)[i % Math.max(1, list(input.pages).length)]
                      ?.url,
                    500,
                  ),
                })),
            })),
      };
    case 'ai-question-suggest':
      return {
        topics: empty
          ? []
          : [
              'demo workflow',
              'demo project dashboard',
              'demo reporting',
              'demo analytics',
            ].map((topic) => ({ topic, reason: `${LABEL}固定测试主题` })),
      };
    case 'knowledge-suggest':
      return {
        title: `${LABEL}资料样例 ${stamp}`,
        category: 'other',
        summary: `${LABEL}仅供演示的资料摘要，未调用真实 AI。`,
        memory: [],
      };
    case 'memory-draft':
      return {
        memory: empty
          ? {}
          : {
              brand: `${LABEL}${str(input.project, 100) || '演示项目'}，仅供测试。`,
              product: `${LABEL}固定样例 ${stamp}，未核实真实产品信息。`,
              rules: `${LABEL}所有生成内容必须经人工检查。`,
            },
      };
    case 'memory-check':
      return {
        memory: empty
          ? []
          : [
              {
                section: 'rules',
                text: `${LABEL}固定样例 ${stamp}，不代表真实长期事实。`,
                reason: `${LABEL}用于验证建议审核流程`,
                source: 'site',
                examples: [],
              },
            ],
      };
    case 'competitor-suggest':
      return {
        competitors: empty
          ? []
          : [
              {
                name: `模拟竞品 ${stamp}`,
                site: 'https://flowgrove.example',
                repo: 'flowgrove/flowgrove',
                reason: `${LABEL}虚构竞品，仅供演示`,
              },
            ],
      };
  }
}
/** No network, SDK, credentials, Runner, or usage charge can be reached from this boundary. */
export async function simulateAi(
  engine: MockEngine,
  operation: MockAiOperation | undefined,
  prompt: string,
  signal?: AbortSignal,
  delayMs = 30_000,
): Promise<string> {
  const ctx = engine.context();
  if (!operation || !MOCK_AI_OPERATIONS.includes(operation))
    throw new MockError('NR_MOCK_UNSUPPORTED_AI_OPERATION');
  if (signal?.aborted)
    throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  if (ctx.scenario === 'slow-cancel' || ctx.scenario === 'timeout')
    await mockDelay(delayMs, signal);
  if (ctx.scenario === 'timeout')
    throw new DOMException('Simulated AI timeout', 'TimeoutError');
  if (ctx.scenario === 'rate-limit')
    throw new MockError('NR_MOCK_AI_RATE_LIMIT', 429);
  if (ctx.scenario === 'login-expired')
    throw new MockError('NR_MOCK_AI_LOGIN_EXPIRED', 401);
  if (ctx.scenario === 'error') throw new MockError('NR_MOCK_AI_ERROR', 503);
  if (ctx.scenario === 'malformed') return '{"simulated":';
  const stamp = createHash('sha256')
    .update(`${ctx.projectId}:${ctx.seed}:${ctx.clock}:${ctx.scenario}`)
    .digest('hex')
    .slice(0, 8);
  const output = fixture(
    operation,
    operation === 'daily-rewrite' ? {} : inputOf(prompt),
    ctx,
    stamp,
  );
  return JSON.stringify({
    ...output,
    simulated: true,
    provider: MOCK_AI_MODEL.llmService,
    model: MOCK_AI_MODEL.model,
  });
}

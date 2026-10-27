import type { NocoReachRuntime } from '../../providers/nocoreach.js';
import type {
  OnlinePage,
  OnlinePageSubject,
} from '../../../shared/online-agent.js';
import { rulesForAgent, type RulesService } from './rules-tools.js';
import { keywordsPageContext } from './keyword-tool.js';

export type PageContextInput = {
  plugin: NocoReachRuntime['plugin'];
  projectId: string;
  subject: OnlinePageSubject;
  /** Whether the conversation's owner may call a business action now (`freshFor`). */
  allowed: (resource: string, action: string) => Promise<boolean>;
};
/** A paragraph for the instructions: where the conversation was opened and that page's current data. */
type PageContext = (input: PageContextInput) => Promise<string>;

const PAGE_NAMES: Record<OnlinePage, string> = {
  analysisRules: 'AI team › Analysis rules',
  keywords: 'Keywords',
};
export const rulesOf = (plugin: NocoReachRuntime['plugin']) =>
  (plugin as unknown as { analysisRules: RulesService }).analysisRules;

/**
 * What the AI knows when a page's AI entry (`PageAiEntry`) opens the chat, read again on every turn so a change saved
 * in between is seen. A page without its own entry here is named with the row it was opened from.
 */
export const PAGE_CONTEXTS: Partial<Record<OnlinePage, PageContext>> = {
  keywords: ({ plugin, projectId, subject, allowed }) =>
    keywordsPageContext(
      (
        plugin as unknown as {
          keywordSuggest: Parameters<typeof keywordsPageContext>[0];
        }
      ).keywordSuggest,
      projectId,
      subject.item,
      allowed,
    ),
  async analysisRules({ plugin, projectId, subject, allowed }) {
    if (!(await allowed('nrAnalysisRules', 'view')))
      return 'The user opened this conversation from AI team › Analysis rules but may not see the rules now; say so.';
    const view = await rulesOf(plugin)
      .view(projectId, subject.item)
      .catch(() => rulesOf(plugin).view(projectId));
    const { rules, ...rest } = rulesForAgent(view);
    return [
      `The user opened this conversation from AI team › Analysis rules, to adjust the rules that find changes in the project's data for the daily analysis. The scheme in view is "${view.schemeName}"${rest.scheme.active ? ' (the one the daily analysis uses)' : ' (not the one the daily analysis uses)'}.`,
      'Its rules now, in brief (analysis_rules has the details, the ranges and the latest changes each rule found):',
      JSON.stringify({
        ...rest,
        rules: rules.map((r) => ({
          id: r.id,
          source: r.source,
          name: r.name,
          enabled: r.enabled,
          numbers: Object.fromEntries(r.numbers.map((n) => [n.key, n.value])),
          foundLastTime: r.foundLastTime,
        })),
      }),
    ].join('\n');
  },
};

/** A page whose data cannot be read now is only named, so the conversation still answers. */
export async function pageContext(input: PageContextInput) {
  const build = PAGE_CONTEXTS[input.subject.page];
  if (build)
    try {
      return await build(input);
    } catch {
      // Named below.
    }
  const item = input.subject.item
    ? `, about "${input.subject.item.replaceAll('"', "'")}"`
    : '';
  return `The user opened this conversation from ${PAGE_NAMES[input.subject.page]}${item}.`;
}

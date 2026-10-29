import type { DemoStory } from '../demo-content.js';
import type { DemoContent, DemoPerson } from './content.js';
import type { L } from './world/script/types.js';
import { ACME_CASES } from './acme-cases.js';
import { CRM_CASES } from './crm-cases.js';
import { ACME_NOTES, CRM_NOTES } from './supporting-cases.js';
import { localCase, type LocalCase } from './case-study.js';
import { FIRST_DRAFTS } from './case-revisions.js';

export interface EditorialStory {
  key: string;
  path: string;
  state: DemoStory['state'];
  kind?: DemoStory['kind'];
  outcome?: DemoStory['outcome'];
  rejected?: boolean;
  cancelled?: boolean;
  archived?: boolean;
  owner?: DemoPerson | 'admin';
  age?: number;
  title: L;
  brief: L;
  comments: readonly (readonly [DemoPerson, L])[];
  draft?: L;
}

export type DemoTaskStory = DemoStory &
  Pick<EditorialStory, 'owner' | 'age'> & {
    caseStudy: LocalCase;
    originalBrief: string;
    previousDraft?: string;
  };

export function localizeStories(
  stories: readonly EditorialStory[],
  language: string,
  people: DemoContent['people'],
): DemoTaskStory[] {
  const lang = language === 'en-US' ? 'en' : 'zh';
  return stories.map(({ title, brief, comments, draft, ...story }) => {
    const crm = story.key.startsWith('crm-');
    const authored = (crm ? CRM_CASES : ACME_CASES)[story.path];
    const note = (crm ? CRM_NOTES : ACME_NOTES)[
      story.path === '/' && crm ? '/docs/quick-start' : story.path
    ];
    if (!authored && !note)
      throw new Error(`Missing demo working document: ${story.key}`);
    const en = lang === 'en';
    const study: LocalCase = authored
      ? localCase(authored, language)
      : {
          audience: en
            ? crm
              ? 'Sales operations, account owners and their reviewer.'
              : 'Project owners, delivery teams and their reviewer.'
            : crm
              ? '销售运营、客户负责人与复核人。'
              : '项目负责人、交付团队与复核人。',
          decision: note[lang].split('\n\n')[1],
          evidence: brief[lang],
          document: note[lang],
          checks: comments.map(([, value]) => value[lang]).join('\n\n'),
          limitation: en
            ? 'The worked example is fictional. Its sample counts are separate from collected site metrics; it establishes no product-wide adoption or causal growth claim.'
            : '案例为虚构演练。样本中的数量与采集的网站指标分开使用，不能据此证明整体采用率或增长因果关系。',
          review: comments.at(-1)![1][lang],
          revision: en
            ? 'Updated the working document and its exception cases. The review checklist below records the remaining scope to confirm.'
            : '已更新工作文档与异常分支；下方复核清单保留仍需确认的适用范围。',
        };
    const origin = crm ? 'https://crm.acme.example' : 'https://acme.example';
    const sources = `[${en ? 'Target page' : '目标页面'}](${origin}${story.path})`;
    const taskBrief = [
      brief[lang],
      `## ${en ? 'Decision and audience' : '目标与读者'}\n\n${study.decision}\n\n${study.audience}`,
      `## ${en ? 'Deliverables' : '交付范围'}\n\n${en ? 'Submit a reviewable working document with the concrete example, decision rules, exception paths and verification checklist. Preserve questions requiring a human decision.' : '提交可复核的工作文档，包含具体案例、判断规则、异常分支与核对清单；保留需要人作决定的问题。'}`,
      `## ${en ? 'Acceptance criteria' : '验收条件'}\n\n${study.checks}`,
      `## ${en ? 'Sources and limits' : '资料与边界'}\n\n${sources}\n\n${study.limitation}`,
    ].join('\n\n');
    const delivery = [
      `# ${title[lang]}`,
      `## ${en ? 'Recommendation' : '结论'}\n\n${study.decision}`,
      `## ${en ? 'Task context' : '本次任务背景'}\n\n${brief[lang]}`,
      `## ${en ? 'Worked-example evidence' : '独立演练案例依据'}\n\n${study.evidence}`,
      study.document,
      `## ${en ? 'Review checklist' : '复核清单'}\n\n${study.checks}`,
      `## ${en ? 'Sources, remaining questions and limits' : '来源、待核实事项与边界'}\n\n${sources}\n\n${study.limitation}`,
      ...(story.age
        ? [
            `## ${en ? 'Historical decision' : '当时的处理决定'}\n\n${comments.at(-1)![1][lang]}\n\n${en ? 'The reusable worked example above is separate from this historical observation and its counts.' : '上方可复用的演练案例与本次历史观察分别记录，数量不混用。'}`,
          ]
        : []),
    ].join('\n\n');
    return {
      ...story,
      kind: story.kind ?? 'content',
      title: title[lang],
      brief: taskBrief,
      originalBrief: brief[lang],
      caseStudy: study,
      previousDraft: FIRST_DRAFTS[story.key]?.[lang],
      comments: comments.map(
        ([person, text]) =>
          `${people[person].name} · ${people[person].title}: ${text[lang]}`,
      ),
      ...(draft || story.state !== 'todo' ? { draft: delivery } : {}),
    };
  });
}

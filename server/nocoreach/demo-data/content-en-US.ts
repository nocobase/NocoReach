import { acmeDocuments, acmeOpportunities } from './acme-content.js';
import { crmDocuments, crmOpportunities } from './crm-content.js';
import type { DemoContent } from './content.js';

/**
 * The English demo: the same fictional Acme editorial team as the Chinese one, with English names. Nothing here
 * describes real Acme customers, traffic or results.
 */
export const EN_US: DemoContent = {
  notice:
    '> Hand-written fictional demo material; the people, discussions, metrics and past results are not real customers, Agent runs or live releases.\n\n',
  taskNote:
    'A hand-written demo scenario. No Agent, model, Runner or publication was involved.',
  flows: {
    content: {
      name: 'Draft and human review',
      draft: 'Prepare the draft',
      review: 'Check facts and scope',
      checklist: 'Check sources, permissions and open questions',
    },
    research: {
      name: 'Research and human review',
      draft: 'Collect the research',
      review: 'Check facts and scope',
      checklist: 'Check sources, permissions and open questions',
    },
  },
  sourcePage: 'Demo project page',
  uncertainty:
    'All material is a hand-written synthetic sample; the product and traffic were not verified.',
  observationNote:
    'Calculated from the demo page’s daily records. This is a simulated observation, not evidence of a real release or a causal effect.',
  projects: {
    main: {
      name: 'Acme',
      domain: 'acme.example',
      description:
        'A fictional project management product for tasks, boards, schedules, milestones and client collaboration. Every metric and discussion is demo data.',
      audience:
        'Project managers, design teams, product teams and client delivery teams',
      market: 'Global',
    },
    second: {
      name: 'Acme CRM',
      domain: 'crm.acme.example',
      description:
        'A fictional sales collaboration product with active work on imports, lead routing, deals and renewals. All people and business results are demo data.',
      audience: 'Sales managers and small B2B teams',
      market: 'North America',
    },
  },
  people: {
    growth: { username: 'grace', name: 'Grace Lawson', title: 'Growth lead' },
    editor: {
      username: 'ethan',
      name: 'Ethan Morgan',
      title: 'Managing editor',
    },
    content: {
      username: 'sophie',
      name: 'Sophie Bennett',
      title: 'Content editor',
    },
    devrel: {
      username: 'henry',
      name: 'Henry Cole',
      title: 'Developer relations',
    },
    consultant: {
      username: 'chloe',
      name: 'Chloe Park',
      title: 'Implementation consultant',
    },
  },
  roles: {
    growth: 'Growth lead',
    editor: 'Managing editor',
    community: 'Community and developer relations',
    viewer: 'Read-only observer',
  },
  stories: [],
  documents: acmeDocuments('en-US'),
  opportunities: acmeOpportunities('en-US'),
  secondTasks: [],
  secondDocuments: crmDocuments('en-US'),
  secondOpportunities: crmOpportunities('en-US'),
  chat: {
    metricsIntro:
      'From the demo project’s search data (through {0}), the queries with the most clicks:',
    metricsLine: '- “{0}”: {1} clicks, {2} impressions, average position {3}',
    metricsOutro:
      'These are the current project’s search results. Open the related pages to check search intent and conversion paths; this answer is simulated.',
    tasksIntro: 'Your tasks in the demo projects:',
    states: {
      todo: 'To do',
      doing: 'In progress',
      review: 'Needs review',
      done: 'Done',
    },
    tasksOutro:
      'Open a task to see its discussion and drafts. (Simulated answer.)',
    opportunitiesIntro: 'The open opportunities of the demo project:',
    opportunitiesOutro:
      'Review the current project’s evidence and priorities, then open an opportunity to turn it into a task. (Simulated answer.)',
    none: 'I found nothing to show for that in the demo project. (Simulated answer.)',
  },
};

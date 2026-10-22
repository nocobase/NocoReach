import {
  DemoModeSettings,
  type DemoChatTool,
  type DemoLabelKind,
} from '@nocobase/app-plugin-demo-mode/client/settings';
import type { ReactElement } from 'react';
import { $t, useNocoReachLocale } from '#i18n';
import { demoSettingsComponents } from './presentation.js';
import { PageContainer } from '#components/reach/page';

/** NocoReach's names for what it registers with Demo Mode; anything else shows the title it registered with. */
const LABELS: Partial<Record<DemoLabelKind, Record<string, string>>> = {
  count: {
    projects: 'demoData.counts.projects',
    accounts: 'demoData.counts.accounts',
    tasks: 'demoData.counts.tasks',
    opportunities: 'demoData.counts.opportunities',
    knowledge: 'demoData.counts.knowledge',
  },
  capability: {
    'nocoreach.tasks': 'demoConfig.capabilityTasks',
    'nocoreach.taskWork': 'demoConfig.capabilityTaskWorkflow',
    'nocoreach.keywordCandidates': 'demoConfig.capabilityKeywordCandidates',
    'nocoreach.knowledge': 'demoConfig.capabilityKnowledge',
    'nocoreach.taskCreation': 'demoConfig.taskCreation',
    'nocoreach.opportunities': 'demoConfig.opportunityHandoff',
    'nocoreach.onlineConversations': 'demoConfig.capabilityOnlineConversations',
  },
  adapter: {
    'dataset.model': 'demoConfig.adapterModel',
    'nocoreach.sources': 'demoConfig.adapterSources',
    'nocoreach.runner': 'demoConfig.adapterRunner',
  },
  chatTool: {
    task_list: 'demoConfig.chatTool.taskList',
    task_get: 'demoConfig.chatTool.taskGet',
    project_data: 'demoConfig.chatTool.projectData',
    read_page: 'demoConfig.chatTool.readPage',
    task_execute: 'demoConfig.chatTool.taskExecute',
  },
};

/** The online Agent's tools (`server/nocoreach/online-agent/host.ts`): local reads, or simulated outside work. */
const CHAT_TOOLS: readonly DemoChatTool[] = [
  { id: 'task_list', policies: ['read'] },
  { id: 'task_get', policies: ['read'] },
  { id: 'project_data', policies: ['read'] },
  { id: 'read_page', policies: ['mock'] },
  { id: 'task_execute', policies: ['mock'] },
];

function label(kind: DemoLabelKind, id: string): string | undefined {
  if (kind === 'scope')
    return $t(
      id === 'all' ? 'demoConfig.allRecords' : 'demoConfig.demoProjects',
    );
  const key = LABELS[kind]?.[id];
  return key ? $t(key) : undefined;
}

/** Settings › Demo management: the Demo Mode plugin's administration page. */
export default function DemoManagementPage(): ReactElement {
  useNocoReachLocale();
  return (
    <PageContainer>
      <DemoModeSettings
        label={label}
        chatTools={CHAT_TOOLS}
        components={demoSettingsComponents}
      />
    </PageContainer>
  );
}

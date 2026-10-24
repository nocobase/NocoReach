import {
  DemoModeSettings,
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
};

function label(kind: DemoLabelKind, id: string): string | undefined {
  const key = LABELS[kind]?.[id];
  return key ? $t(key) : undefined;
}

/** Settings › Demo management: the Demo Mode plugin's administration page. */
export default function DemoManagementPage(): ReactElement {
  useNocoReachLocale();
  return (
    <PageContainer>
      <DemoModeSettings label={label} components={demoSettingsComponents} />
    </PageContainer>
  );
}

import { RunnerAgentsSection } from '@nocobase/app-plugin-agents/client/kit';
import { $t } from '#i18n';
import { PageContainer } from '#components/reach/page';

// Agent › Local agents: the Agents plugin's list, where people enable a reported agent and say what it is good at. The
// project default is set from the overview's Tasks › Settings (2026-10-22 user decision). Like the plugin's tabs, the
// heading is for screen readers only and the description comes first.
export default function LocalAgentsPage() {
  return (
    <PageContainer>
      <LocalAgents />
    </PageContainer>
  );
}

export function LocalAgents() {
  return (
    <section className='flex flex-col gap-6 [&_#agents-runner-heading]:sr-only'>
      <header>
        <h2 className='sr-only'>{$t('common.runnerAgent')}</h2>
        <p className='mt-1.5 max-w-3xl text-sm text-muted-foreground'>
          {$t('agentsPage.runnerDescription')}
        </p>
      </header>
      <RunnerAgentsSection />
    </section>
  );
}

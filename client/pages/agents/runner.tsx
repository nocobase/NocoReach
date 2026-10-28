import { RunnerAgentsSection } from '@nocobase/app-plugin-agents/client/kit';
import { useTranslation } from '@nocobase/i18n/client';
import { $t } from '#i18n';
import { PageContainer } from '#components/reach/page';

// Agent › Local agents: the plugin's list and Available models flow. The
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
  const { t } = useTranslation('@nocobase/app-plugin-agents');
  return (
    <section className='flex flex-col gap-6 [&_#agents-runner-heading]:sr-only'>
      <header>
        <h2 className='sr-only'>{$t('common.runnerAgent')}</h2>
        <p className='mt-1.5 max-w-3xl text-sm text-muted-foreground'>
          {t('agents.description')}
        </p>
      </header>
      <RunnerAgentsSection />
    </section>
  );
}

import { RunnerAgentsSection } from '@nocobase/app-plugin-agents/client/kit';
import { AgentsPageLayout } from './index.js';

export default function RunnerAgents() {
  return (
    <AgentsPageLayout>
      <RunnerAgentsSection />
    </AgentsPageLayout>
  );
}

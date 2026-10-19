import { systemMessageText } from './i18n/messages.js';
import { createPlaybookCatalog } from './playbook-definition.js';

export type * from './playbook-definition.js';

// Server-owned defaults retain their canonical Chinese text and public API.
export const { AGENT_PLAN_INSTRUCTION, SYSTEM_PLAYBOOKS, stagesFor } =
  createPlaybookCatalog(systemMessageText);

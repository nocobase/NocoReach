import { createPlaybookCatalog } from '../../shared/playbook-definition.js';
import { messages } from '../i18n/message-catalog.js';

// The route loader prepares these resources before evaluating business pages.
// Snapshot identity always uses canonical Chinese, including on English pages.
export const { SYSTEM_PLAYBOOKS, stagesFor } = createPlaybookCatalog(
  (key) => messages.chinese[key] ?? key,
);

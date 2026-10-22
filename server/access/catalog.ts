import { adminOnly } from '../nocoreach/policy.js';
import { TASK_COMMANDS } from '../../shared/access-capabilities.js';

/** Shared configuration must never inherit a client-supplied project selection. */
export function applicationAction(resource: string, action: string): boolean {
  switch (resource) {
    case 'nrMembers':
    case 'nrImport':
    case 'nrKeys':
    case 'nrSchedules':
      return true;
    case 'nrProjects':
      return action === 'create';
    case 'nrOnline':
      return action === 'manage';
    case 'nrOnlineAI':
      return action === 'setModel';
    case 'nrProxyProfiles':
      return !['selections', 'select', 'testConnection'].includes(action);
    case 'nrSkills':
      return [
        'create',
        'import',
        'importLink',
        'edit',
        'addFiles',
        'removeFile',
        'remove',
      ].includes(action);
    default:
      return false;
  }
}

export const administratorAction = (resource: string, action: string) =>
  ['nrImport', 'nrKeys', 'nrSchedules'].includes(resource) ||
  (resource === 'nrOnline' && action === 'manage') ||
  adminOnly(resource, action);

export const taskCommandActions = [
  { resource: 'nrTaskWork', action: 'execute' },
  ...TASK_COMMANDS.map((command) => ({
    resource: 'nrTaskWork',
    action: `command.${command}`,
  })),
];

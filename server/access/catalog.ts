import { adminOnly } from '../nocoreach/policy.js';

/** Shared configuration must never inherit a client-supplied project selection. */
export function applicationAction(resource: string, action: string): boolean {
  switch (resource) {
    case 'nrMembers':
    case 'nrImport':
    case 'nrKeys':
    case 'nrSchedules':
      return true;
    case 'nrProjects':
      return action !== 'list';
    case 'nrOnline':
      return action === 'manage';
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

export const TASK_COMMANDS = [
  'moveWork',
  'startSimple',
  'linkContent',
  'takeOwnership',
  'setOwner',
  'setAgent',
  'setCollaborators',
  'linkPage',
  'savePlan',
  'approvePlan',
  'saveResult',
  'approveResult',
  'requestChanges',
  'replan',
  'recordExecution',
  'verify',
  'selectPlaybook',
  'startTask',
  'comment',
  'approveStage',
  'requestStageChanges',
  'editStageOutput',
  'recordManual',
  'recoverResult',
  'retryStage',
  'cancelRun',
  'retryMerge',
  'markMerged',
  'confirmLive',
  'waitLonger',
  'revertRelease',
  'cancelTask',
  'archiveTask',
  'unarchiveTask',
  'confirmPublish',
] as const;
export const taskCommandActions = [
  { resource: 'nrTaskWork', action: 'execute' },
  ...TASK_COMMANDS.map((command) => ({
    resource: 'nrTaskWork',
    action: `command.${command}`,
  })),
];

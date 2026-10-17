import type {
  ApiKeyView,
  CreatedApiKey,
} from '@nocobase/app-plugin-api-keys/shared/scopes';
export type ManagedKey = ApiKeyView & {
  ownerId: string;
  type: 'personal' | 'organization';
  revoked?: boolean;
};
export type KeyList = { canManage: boolean; items: ManagedKey[] };
export type KeyOptions = {
  levels: string[];
  projects: { id: string; name: string; levels: string[] }[];
  roles: {
    key: string;
    title?: string | { key: string; ns: string };
    assignable: boolean;
  }[];
};
export type KeyEvent = {
  id: string;
  actorId: string;
  action: string;
  createdAt: string;
};
export type { CreatedApiKey };

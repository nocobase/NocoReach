import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useAuthorizationRevision } from '@nocobase/app-plugin-authorization/client';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { $t } from '#i18n';

export type {
  AccessMember,
  BusinessRole,
  MemberInvitation,
  AccessCatalogue,
  InvitationResult,
} from '../../../shared/member-access.js';
export function useAccessApi(namespace = 'nocoreachAccess') {
  const api = useApiClient();
  return useCallback(
    async <T>(
      path: string,
      json?: unknown,
      method: 'GET' | 'POST' | 'PUT' | 'DELETE' = json === undefined
        ? 'GET'
        : 'POST',
    ): Promise<T> => {
      const response = await api.request<{ data: T }>({
        path: `${namespace}${path}`,
        method,
        ...(json === undefined ? {} : { json }),
      });
      return response.data;
    },
    [api, namespace],
  );
}
export function useAccessQuery<T>(
  path: string,
  enabled = true,
  namespace = 'nocoreachAccess',
) {
  const call = useAccessApi(namespace);
  const { session } = useAuthentication();
  const revision = useAuthorizationRevision();
  return useQuery({
    queryKey: [
      'reach-access',
      namespace,
      session?.user.id,
      session?.session.id,
      revision,
      path,
    ],
    queryFn: () => call<T>(path),
    enabled,
    staleTime: 0,
    retry: false,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
}
const REASONS = [
  'invalidScope',
  'invalidRole',
  'inviterChanged',
  'ungrantable',
  'roleExpanded',
  'builtIn',
  'missing',
  'missingProject',
  'roleExists',
  'changed',
  'roleAssigned',
  'accountUnavailable',
  'systemAccount',
  'originRequired',
  'alreadyPending',
  'alreadyMember',
  'closed',
  'originalInviter',
  'wrongAccount',
  'accepted',
  'revoked',
  'expired',
  'invalidInvitation',
  'interactiveOnly',
  'scopeExceedsRoles',
];
/** The message of a known failure reason, such as one address of a batch invitation. */
export function accessReasonMessage(reason?: string): string {
  if (reason && REASONS.includes(reason))
    return $t(`accessMembers.errors.${reason}`);
  if (reason === 'LAST_BUSINESS_ADMIN')
    return $t('accessMembers.errors.lastAdmin');
  return $t('accessMembers.errors.failed');
}
export function accessMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (
      error.reason &&
      (REASONS.includes(error.reason) || error.reason === 'LAST_BUSINESS_ADMIN')
    )
      return accessReasonMessage(error.reason);
    if (error.status === 401) return $t('accessMembers.errors.signedOut');
    if (error.status === 403) return $t('accessMembers.errors.denied');
    if (error.status === 404) return $t('accessMembers.errors.missing');
    if (error.status === 409) return $t('accessMembers.errors.changed');
  }
  return $t('accessMembers.errors.failed');
}
export function roleTitle(role: { key: string; title?: string }) {
  return role.key === 'nr.admin'
    ? $t('accessMembers.administrator')
    : role.key === 'nr.member'
      ? $t('accessMembers.member')
      : role.title || role.key;
}

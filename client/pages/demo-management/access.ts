import { useApiClient } from '@nocobase/app-client';
import {
  useAuthorizationRevision,
  useCan,
} from '@nocobase/app-plugin-authorization/client';
import { useEffect, useState } from 'react';

export function useDemoAccess() {
  const api = useApiClient();
  const revision = useAuthorizationRevision();
  const check = (id: string, action: string) => ({
    resource: { type: 'settings', id },
    action,
  });
  const members = useCan({
    resource: { type: 'page', id: 'members' },
    action: 'access',
  });
  const data = useCan(check('demoMode.data', 'read'));
  const manage = useCan(check('demoMode.data', 'manage'));
  const configuration = useCan(check('demoMode.configuration', 'read'));
  const configure = useCan(check('demoMode.configuration', 'configure'));
  const [result, setResult] = useState<{ revision: number; mode: string }>();
  useEffect(() => {
    let alive = true;
    void api
      .request<{ data: { mode: string } }>({ path: '/demoMode/status' })
      .then(({ data: status }) => {
        if (alive) setResult({ revision, mode: status.mode });
      })
      .catch(() => {
        if (alive) setResult({ revision, mode: 'off' });
      });
    return () => {
      alive = false;
    };
  }, [api, revision]);
  const enabled = result?.revision === revision && result.mode !== 'off';
  return {
    revision,
    manageRoles: members.can,
    mode: result?.mode,
    enabled,
    readData: enabled && data.can,
    manageData: enabled && data.can && manage.can,
    readConfiguration: enabled && configuration.can,
    configure: enabled && configuration.can && configure.can,
    visible: enabled && (data.can || configuration.can),
    pending:
      result?.revision !== revision ||
      data.isPending ||
      configuration.isPending,
  };
}

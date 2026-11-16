import { useEffect, useState } from 'react';
import { nocobaseClient as api } from '#lib/nocoreach-api';

// The data behind Analysis rules' lines for the step 2b sources (growth-sources.tsx): nrGrowthSources' view and actions.

export type GrowthSourcesView = {
  markets: { list: string[]; by: 'ai' | 'person' | null; options: string[] };
  siteSearch: { status: string; at?: string; terms: number } | null;
  budgetUntil: string | null;
};

export const call = <T>(action: string, projectId: number, body: object = {}) =>
  api.action<T>('nrGrowthSources', action, {
    method: 'POST',
    body: { ...body, projectId },
    unwrap: 'data',
  });

export function useGrowthSources(projectId: number) {
  const [view, setView] = useState<GrowthSourcesView>();
  useEffect(() => {
    let current = true;
    void call<GrowthSourcesView>('view', projectId)
      .then((v) => {
        // An older server has no such action; nothing is shown then.
        if (current && v?.markets) setView(v);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [projectId]);
  return [view, setView] as const;
}

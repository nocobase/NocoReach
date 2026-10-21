import type {
  DemoClearContext,
  DemoDataset,
} from '@nocobase/app-plugin-demo-mode/server/tokens';
import type { NocoBaseDriveManager } from '@nocobase/drive';

import { demoAnswers } from './answers.js';
import { clearAllBusinessData } from './clear-all.js';
import { clearProjects } from './clear.js';
import { DEMO_LANGUAGES, demoContent } from './content.js';
import type { Connections } from '../plugin.js';
import type { DemoHost } from './host.js';
import { demoAccounts, demoSteps, type DemoData } from './steps.js';
import type { DemoProject } from './upstream.js';

export { DemoProjects } from './upstream.js';

interface DemoMarker {
  dataset?: string;
  language?: string;
  expired?: string[];
}

/** The demo projects in the database, from the marker the import puts on each; readable before the services load. */
export async function demoProjectsOf(
  connections: Connections,
  id?: string,
): Promise<DemoProject[]> {
  const host = connections as DemoHost;
  const rows = (await host.db.getRepository('nrSnapshots').find({
    filter: { key: id ? `project:${id}` : { $like: 'project:%' } },
  })) as {
    get(name: string): unknown;
  }[];
  const projects = rows.map((row) => row.get('payload')) as {
    id: number | string;
    name: string;
    domains?: string[];
    demo?: DemoMarker;
  }[];
  return projects
    .filter((project) => project.demo?.dataset === 'nocoreach')
    .map((project) => ({
      id: String(project.id),
      name: project.name,
      domain: project.domains?.[0] ?? '',
      ...(project.demo?.expired ? { expired: project.demo.expired } : {}),
    }));
}

/**
 * NocoReach's demo: the NocoBase marketing team's two projects with their connected sources, tasks, results,
 * opportunities and knowledge, and five people with different roles. Sources are collected through the production
 * flows from in-process fixtures, so the pages and their refresh actions work and nothing leaves the process.
 */
export function createNocoReachDemo(
  connections: Connections,
  drive: NocoBaseDriveManager,
  clearCache: () => void,
): DemoDataset {
  const host = connections as DemoHost;
  const ids = async (context: DemoClearContext) => {
    const recorded = (context.data as DemoData).projects;
    return [
      ...new Set([
        ...(recorded ? [recorded.main, recorded.second].filter(Boolean) : []),
        // A project an import made before it could record it still carries the marker.
        ...(await demoProjectsOf(host)).map((project) => project.id),
      ]),
    ];
  };
  return {
    id: 'nocoreach',
    languages: DEMO_LANGUAGES,
    timeZone: (language) =>
      language === 'en-US' ? 'America/Los_Angeles' : 'Asia/Shanghai',
    accounts: demoAccounts,
    steps: (language) => demoSteps(host, language),
    clear: async (context) => clearProjects(host, await ids(context)),
    clearAll: async () => clearAllBusinessData(host, drive, clearCache),
    counts: async (context) => {
      const projects = await ids(context);
      const content = demoContent(context.language ?? 'zh-CN');
      const tasks = await host.db
        .getRepository('nrTasks')
        .count({ filter: { projectId: { $in: projects } } });
      return {
        projects: projects.length,
        accounts: Object.keys(content.people).length,
        tasks,
        opportunities: content.opportunities.briefs.length,
        knowledge: content.documents.length,
      };
    },
    answers: demoAnswers(),
  };
}

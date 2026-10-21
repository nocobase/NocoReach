import { randomUUID } from 'node:crypto';

import {
  fixtureCatalog,
  fixtureResponse,
} from '../../../app-plugins/nocoreach-mock/server/fixtures.js';
import type { MockRunContext } from '../../../app-plugins/nocoreach-mock/server/types.js';
import type { DemoUpstream } from '../outbound-network.js';

export interface DemoProject {
  readonly id: string;
  readonly name: string;
  readonly domain: string;
  /** Connections whose sign-in the demo shows as expired, such as `google`. */
  readonly expired?: readonly string[];
}

/**
 * The projects the demo data created and what answers their requests: the simulated deployment's fixture responses,
 * dated by the real clock so the data always reads as recent. A request the fixtures do not cover is refused, never
 * sent; nothing a demo project asks for leaves the process.
 */
export class DemoProjects implements DemoUpstream {
  public configuration?: import('@nocobase/app-plugin-demo-mode/server/tokens').DemoConfigurationService;
  private readonly projects = new Map<string, DemoProject>();
  private readonly retired = new Set<string>();

  constructor(
    private readonly lookup?: (id: string) => Promise<DemoProject | undefined>,
  ) {}

  /** Unknown projects are checked in storage before any I/O, including imports made by another process. */
  async recognize(id: string): Promise<boolean> {
    if (this.has(id)) return true;
    const project = await this.lookup?.(String(id));
    if (project) this.add(project);
    return this.has(id);
  }

  replace(projects: readonly DemoProject[]): void {
    this.projects.clear();
    for (const project of projects) this.add(project);
  }

  add(project: DemoProject): void {
    this.projects.set(String(project.id), project);
  }

  remove(id: string): void {
    // Work already queued for a cleared demo must keep failing closed.
    this.retired.add(String(id));
    this.projects.delete(String(id));
  }

  /** From now on the connection's sign-in is refused, as an expired authorization is. */
  expire(id: string, connection: string): void {
    const project = this.projects.get(String(id));
    if (project)
      this.projects.set(String(id), {
        ...project,
        expired: [...new Set([...(project.expired ?? []), connection])],
      });
  }

  has(id: string): boolean {
    return this.projects.has(String(id)) || this.retired.has(String(id));
  }

  ids(): string[] {
    return [...this.projects.keys()];
  }

  context(id: string, connection?: string): MockRunContext {
    const project = this.projects.get(String(id));
    if (!project) throw new Error(`Project ${id} is not a demo project`);
    return {
      projectId: String(id),
      project: { name: project.name, domain: project.domain },
      enabled: true,
      seed: `nocoreach-demo-${project.domain}`,
      clock: new Date().toISOString(),
      // Lists long enough to page through, as the simulated deployment's demo has them.
      scenario: 'pagination',
      revision: 1,
      runId: randomUUID(),
      ...(connection ? { connection } : {}),
    };
  }

  /** The fictional Google account, property and site the fixtures answer for this project. */
  catalog(id: string): {
    ga4PropertyId: string;
    gscSiteUrl: string;
    googleEmail: string;
  } {
    return fixtureCatalog(this.context(id)) as {
      ga4PropertyId: string;
      gscSiteUrl: string;
      googleEmail: string;
    };
  }

  async request(
    projectId: string,
    url: string | URL,
    init: RequestInit = {},
  ): Promise<Response> {
    return this.configuration
      ? this.configuration.invokeMock<Response>('nocoreach.sources', {
          projectId,
          url,
          init,
        })
      : this.fixtureRequest(projectId, url, init);
  }

  async fixtureRequest(
    projectId: string,
    url: string | URL,
    init: RequestInit = {},
  ): Promise<Response> {
    init.signal?.throwIfAborted();
    const target = new URL(url);
    if (
      target.hostname === 'oauth2.googleapis.com' &&
      this.projects.get(String(projectId))?.expired?.includes('google')
    )
      return Response.json(
        {
          error: 'invalid_grant',
          error_description: 'Token has been expired or revoked.',
        },
        { status: 400 },
      );
    try {
      return await fixtureResponse(url, init, this.context(projectId));
    } catch (cause) {
      throw Object.assign(
        new Error(
          'This demo project does not connect to outside services; the request was not sent.',
          { cause },
        ),
        { code: 'NR_DEMO_OFFLINE', status: 409 },
      );
    }
  }
}

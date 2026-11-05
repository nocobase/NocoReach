import path from 'node:path';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

/**
 * Seconds each slow file took in CI (`pnpm test --shard`, three workers). Vitest's own sharding splits files by a hash
 * of their path, which once put the three slowest files on one shard: it ran for five minutes while another finished in
 * two. Every file still runs; a stale or missing entry only makes the shards less even. Refresh the list from a CI run
 * when a file becomes slow or stops being slow.
 */
const SLOW_FILES: Record<string, number> = {
  'tests/nocoreach/demo-data-app.test.ts': 263,
  'tests/nocoreach/demo-data-lifecycle-app.test.ts': 155,
  'tests/nocoreach/mock-app.test.ts': 91,
  'tests/nocoreach/preview-sample-data-app.test.ts': 85,
  'tests/nocoreach/member-access-app.test.ts': 81,
  'tests/nocoreach/demo-data-conversations-app.test.ts': 73,
  'tests/logic/app-server.test.ts': 40,
  'tests/nocoreach/key-management-app.test.ts': 36,
  'tests/nocoreach/online-task-tools-app.test.ts': 23,
  'tests/nocoreach/online-agents-app.test.ts': 22,
  'tests/nocoreach/demo-editorial.test.ts': 19,
  'tests/nocoreach/ga4-report-cache.test.ts': 19,
  'tests/nocoreach/task-drafts.test.tsx': 18,
  'tests/nocoreach/mock-demo-startup.test.ts': 17,
  'tests/components/data-website.test.tsx': 16,
  'tests/components/nocoreach-task-filter-locale.test.tsx': 15,
  'tests/nocoreach/demo-editorial-fresh.test.ts': 15,
  'tests/nocoreach/agents-app.test.ts': 13,
  'tests/nocoreach/project-access-app.test.ts': 13,
  'tests/components/task-page-layout.test.tsx': 13,
  'tests/nocoreach/socks-transport.test.ts': 12,
  'tests/components/bilibili-connect.test.tsx': 12,
  'tests/logic/nocoreach-source-package.test.ts': 10,
};
// Any other file: about a second of tests plus a second to import it.
const IMPORT_SECONDS = 1;
const OTHER_FILE_SECONDS = 1;

/** Splits files across shards by their expected time and starts the slowest first. */
export class DurationSequencer extends BaseSequencer {
  private seconds(spec: TestSpecification): number {
    const file = path
      .relative(this.ctx.config.root, spec.moduleId)
      .split(path.sep)
      .join('/');
    return IMPORT_SECONDS + (SLOW_FILES[file] ?? OTHER_FILE_SECONDS);
  }

  // Longest first onto the least loaded shard. Every shard computes the same split from the same file list.
  override async shard(
    files: TestSpecification[],
  ): Promise<TestSpecification[]> {
    const { index, count } = this.ctx.config.shard!;
    const ordered = [...files].sort(
      (a, b) =>
        this.seconds(b) - this.seconds(a) ||
        (a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0),
    );
    const loads = new Array<number>(count).fill(0);
    return ordered.filter((spec) => {
      const lightest = loads.indexOf(Math.min(...loads));
      loads[lightest] += this.seconds(spec);
      return lightest === index - 1;
    });
  }

  // Without Vitest's result cache, as in CI, files would start in discovery order and a slow one could start last.
  override async sort(
    files: TestSpecification[],
  ): Promise<TestSpecification[]> {
    const sorted = await super.sort(files);
    return sorted.sort((a, b) => this.seconds(b) - this.seconds(a));
  }
}

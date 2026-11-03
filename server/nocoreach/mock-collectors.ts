import {
  freezeMockCollectorContext,
  mockCollectorTransport,
} from '../../app-plugins/nocoreach-mock/server/collectors.js';
import type { MockRunContext } from '../../app-plugins/nocoreach-mock/server/types.js';
import {
  HttpXiaohongshuAdapter,
  XiaohongshuError,
  type XiaohongshuAdapter,
} from './xiaohongshu-adapter.js';
import {
  HttpBilibiliAdapter,
  BilibiliError,
  type BilibiliAdapter,
} from './bilibili-adapter.js';
export { mockBrowserCollectors } from '../../app-plugins/nocoreach-mock/server/collectors.js';

type CollectorContext =
  MockRunContext | ((projectId: string) => MockRunContext);

function collectorContext(source: CollectorContext, projectId: string) {
  const context = freezeMockCollectorContext(
    typeof source === 'function' ? source(projectId) : source,
  );
  // Never reuse one project's injected fixture context in another project's request.
  if (String(context.projectId) !== projectId)
    throw new Error('Mock collector project mismatch');
  return context;
}
export function createMockXiaohongshuAdapter(
  source: CollectorContext,
): XiaohongshuAdapter {
  const adapter = (projectId: string) => {
    let context: Readonly<MockRunContext>;
    try {
      context = collectorContext(source, projectId);
    } catch {
      throw new XiaohongshuError('invalid_response');
    }
    return new HttpXiaohongshuAdapter(
      mockCollectorTransport(context, 'xiaohongshu'),
      () => Date.parse(context.clock),
    );
  };
  return {
    async health(config, input) {
      return adapter(input.projectId).health(config, input);
    },
    async search(config, input) {
      return adapter(input.projectId).search(config, input);
    },
  };
}
export function createMockBilibiliAdapter(
  source: CollectorContext,
): BilibiliAdapter {
  const adapter = (projectId: string) => {
    let context: Readonly<MockRunContext>;
    try {
      context = collectorContext(source, projectId);
    } catch {
      throw new BilibiliError('invalid_response');
    }
    return new HttpBilibiliAdapter(
      mockCollectorTransport(context, 'bilibili'),
      () => Date.parse(context.clock),
    );
  };
  return {
    async health(config, input) {
      return adapter(input.projectId).health(config, input);
    },
    async search(config, input) {
      return adapter(input.projectId).search(config, input);
    },
    async video(config, input) {
      return adapter(input.projectId).video(config, input);
    },
  };
}

import {
  freezeMockCollectorContext,
  mockCollectorTransport,
  mockYouTubeDependencies,
  MockMediaError,
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
import {
  YouTubeProvider,
  YouTubeError,
  type YouTubeRunner,
} from './youtube-provider.js';
import type { OutboundNetwork } from './outbound-network.js';
export { mockBrowserCollectors } from '../../app-plugins/nocoreach-mock/server/collectors.js';

type CollectorContext =
  MockRunContext | ((projectId: string) => MockRunContext);
type YouTubeContext = MockRunContext | (() => MockRunContext);

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

/** Host owns production normalization; plugin owns only fictional upstream I/O. */
function youtube(context: Readonly<MockRunContext>): YouTubeProvider {
  const dependencies = mockYouTubeDependencies(context);
  const translate = (error: unknown): never => {
    throw new YouTubeError(
      error instanceof MockMediaError ? error.code : 'invalid_response',
    );
  };
  const runner: YouTubeRunner = (...args) =>
    dependencies.runner(...args).catch(translate);
  const readCaption = (url: string, signal: AbortSignal) =>
    dependencies.readCaption(url, signal).catch(translate);
  // Explicit dependencies leave no process, DNS, or download fallback in simulated mode.
  const network = { selected: () => undefined } as unknown as OutboundNetwork;
  return new YouTubeProvider(
    network,
    runner,
    readCaption,
    () => new Date(context.clock),
  );
}

export function createMockYouTubeProvider(
  source: YouTubeContext,
): Pick<YouTubeProvider, 'search' | 'video'> {
  const provider = () =>
    youtube(
      freezeMockCollectorContext(
        typeof source === 'function' ? source() : source,
      ),
    );
  return {
    async search(term, signal) {
      return provider().search(term, signal);
    },
    async video(videoId, signal) {
      return provider().video(videoId, signal);
    },
  };
}

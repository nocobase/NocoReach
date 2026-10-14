// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigEnv, UserConfig } from 'vite';
import config from '../../vite.config';

// Plugin discovery is orthogonal to the application's version metadata.
vi.mock('@nocobase/dev-config/vite/plugins', () => ({
  loadAppVitePlugins: async () => [],
}));

afterEach(() => vi.unstubAllEnvs());

describe('application template metadata', () => {
  it.each(['serve', 'build'] as const)(
    'injects the adopted baseline in %s',
    async (command) => {
      vi.stubEnv('APP_BASE_PATH', '/studio/apps/nocoreach');
      vi.stubEnv('AGENT_ANNOTATIONS_ENABLED', 'false');
      const manifest = JSON.parse(
        readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
      );
      const resolved = await (
        config as (env: ConfigEnv) => Promise<UserConfig>
      )({
        command,
        mode: command === 'serve' ? 'development' : 'production',
      });
      expect(JSON.parse(resolved.define!.__NOCOREACH_TEMPLATE_VERSION__)).toBe(
        manifest.nocobase.defaultTemplateVersion,
      );
    },
  );
});

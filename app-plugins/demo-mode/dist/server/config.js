export const DEMO_MODE_ENV = 'NOCOBASE_DEMO_MODE';
export const DEMO_MODE_ALLOW_TABLES_ENV = 'NOCOBASE_DEMO_ALLOW_TABLES';
export const DEMO_DATA_MODELS_ENV = 'NOCOBASE_DEMO_DATA_MODELS';
export const DEMO_DATA_MODEL_BASE_URL_ENV = 'NOCOBASE_DEMO_DATA_MODEL_BASE_URL';
/**
 * Tables official plugins write while someone only signs in, signs out or browses: Better Auth's session rows, and
 * its verification rows for one-time codes. Anything else is refused until a deployment allows it.
 */
export const DEFAULT_ALLOW_TABLES = [
    'session',
    'verification',
];
const MODES = ['off', 'read-only', 'observe'];
export class DemoModeConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DemoModeConfigError';
    }
}
export function resolveDemoModeSettings(config, env = process.env) {
    const section = config.get('demoMode') ?? {};
    const mode = env[DEMO_MODE_ENV]?.trim() || section.mode || 'off';
    if (!MODES.includes(mode)) {
        throw new DemoModeConfigError(`${DEMO_MODE_ENV} must be one of ${MODES.join(', ')}; got "${mode}".`);
    }
    const extra = env[DEMO_MODE_ALLOW_TABLES_ENV]?.split(',') ?? section.allowTables ?? [];
    const allowTables = new Set([...DEFAULT_ALLOW_TABLES, ...extra]
        .map((table) => table.trim().toLowerCase())
        .filter((table) => table !== ''));
    return {
        mode: mode,
        allowTables,
        data: resolveDataSettings(section.data ?? {}, env),
    };
}
function resolveDataSettings(section, env) {
    const flag = env[DEMO_DATA_MODELS_ENV]?.trim().toLowerCase();
    if (flag && !['true', 'false'].includes(flag)) {
        throw new DemoModeConfigError(`${DEMO_DATA_MODELS_ENV} must be true or false; got "${flag}".`);
    }
    const modelBaseUrl = env[DEMO_DATA_MODEL_BASE_URL_ENV]?.trim() || section.modelBaseUrl;
    if (modelBaseUrl && !/^https?:\/\//u.test(modelBaseUrl)) {
        throw new DemoModeConfigError(`The demo model base URL must start with http:// or https://; got "${modelBaseUrl}".`);
    }
    return {
        models: flag ? flag === 'true' : section.models !== false,
        ...(modelBaseUrl
            ? { modelBaseUrl: modelBaseUrl.replace(/\/+$/u, '') }
            : {}),
    };
}
//# sourceMappingURL=config.js.map
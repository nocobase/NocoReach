/** Public, credential-free contract shared by fixture providers and the host adapter. */
export const MOCK_SCENARIOS = [
  'normal',
  'newdata',
  'empty',
  'pagination',
  'rate-limit',
  'login-expired',
  'timeout',
  'malformed',
  'error',
  'slow-cancel',
] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];
export interface MockConfig {
  readonly enabled: boolean;
  /** Required explicitly when enabled. This plugin must only run in a dedicated demo/test deployment. */
  readonly environment?: 'demo' | 'test' | '';
}
export interface MockProjectSettings {
  readonly enabled: boolean;
  readonly scenario: MockScenario;
  readonly seed: string;
  readonly clock: string;
  readonly revision: number;
}
export interface MockRunContext {
  /** Captured availability; absent on legacy fixture-only inputs means enabled. */
  readonly enabled?: boolean;
  readonly projectId: string;
  readonly seed: string;
  readonly clock: string;
  readonly scenario: MockScenario;
  readonly revision: number;
  readonly runId: string;
}
export interface MockStatus extends MockProjectSettings {
  readonly projectId: string;
  readonly globalEnabled: boolean;
  readonly environment: 'demo' | 'test' | null;
  readonly simulated: boolean;
  readonly coverage: readonly string[];
  readonly defaults: Readonly<Record<string, string>>;
}
export interface MockVariables {
  all(): Record<string, string | undefined>;
  set(name: string, value: string, secret?: boolean): Promise<unknown>;
  cannotRead?(name: string): boolean;
}
export interface MockActionContext {
  action: { params: { values?: unknown; projectId?: unknown } };
  request?: { query?: { projectId?: unknown } };
  body?: unknown;
  set(name: string, value: string): void;
  throw(status: number, message: string): never;
}
export type MockAction = (
  ctx: MockActionContext,
  next: () => Promise<void>,
) => Promise<void>;
/** The application owns authentication, membership, projects and storage; the plugin never bypasses them. */
export interface MockHost {
  variables: MockVariables;
  /** Fail unless the unmarked host database contains no live source, credential, report or business data. */
  assertPristine?: () => Promise<void>;
  app: {
    resourceManager: {
      define(resource: {
        name: string;
        actions: Record<string, MockAction>;
      }): unknown;
    };
    acl: { allow(resource: string, actions: string[], role: string): unknown };
  };
  project(id: string): Promise<unknown>;
  requireAccess(ctx: MockActionContext): Promise<unknown>;
}

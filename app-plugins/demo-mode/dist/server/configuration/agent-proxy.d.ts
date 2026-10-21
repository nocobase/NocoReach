import type { DemoConfigurationService } from './service.js';
/** The application owns the result contract, including streaming if needed. */
export interface DemoAgentAdapter<Input, Output> {
    id: string;
    title: string;
    defaultEnabled?: boolean;
    execute(input: Input): Promise<Output>;
}
/** An environment-wide replacement at the Agent boundary. Disabled demo calls never fall back to a real Agent. */
export declare class DemoAgentProxy<Input, Output> {
    private readonly configuration;
    private readonly adapter;
    constructor(configuration: DemoConfigurationService, adapter: DemoAgentAdapter<Input, Output>);
    get id(): string;
    get title(): string;
    /** Call before enqueueing, and persist the selected proxy id with durable work. */
    prepare(): Promise<boolean>;
    /** Rechecks configuration when queued work actually executes. */
    execute(input: Input): Promise<Output>;
    run(input: Input, realAgent: () => Promise<Output>): Promise<Output>;
}
//# sourceMappingURL=agent-proxy.d.ts.map
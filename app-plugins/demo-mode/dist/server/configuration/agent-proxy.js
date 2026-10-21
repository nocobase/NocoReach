/** An environment-wide replacement at the Agent boundary. Disabled demo calls never fall back to a real Agent. */
export class DemoAgentProxy {
    configuration;
    adapter;
    constructor(configuration, adapter) {
        this.configuration = configuration;
        this.adapter = adapter;
        configuration.registerMock({
            id: adapter.id,
            title: adapter.title,
            kind: 'runner',
            scope: 'environment',
            defaultEnabled: adapter.defaultEnabled,
            invoke: (input) => adapter.execute(input),
        });
    }
    get id() {
        return this.adapter.id;
    }
    get title() {
        return this.adapter.title;
    }
    /** Call before enqueueing, and persist the selected proxy id with durable work. */
    async prepare() {
        if (!this.configuration.enabled)
            return false;
        await this.configuration.requireMock(this.id);
        return true;
    }
    /** Rechecks configuration when queued work actually executes. */
    execute(input) {
        return this.configuration.invokeMock(this.id, input);
    }
    async run(input, realAgent) {
        return (await this.prepare()) ? this.execute(input) : realAgent();
    }
}
//# sourceMappingURL=agent-proxy.js.map
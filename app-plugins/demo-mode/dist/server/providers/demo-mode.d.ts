import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';
export declare class DemoModeProvider extends ServiceProvider<AppPluginApplication> {
    readonly name: string;
    private guard;
    private connectionNames;
    register(): void;
    /** Guards every connection and proves it with a probe write, refusing to start when a connection is not guarded. */
    ready(): Promise<void>;
    private attachConnections;
    private client;
    private connections;
    private logger;
}
//# sourceMappingURL=demo-mode.d.ts.map
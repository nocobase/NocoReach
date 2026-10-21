import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';
/** The Scheduler target a configured reset schedule points at. */
export declare const DEMO_DATA_RESET_TARGET = "demoMode.resetData";
/**
 * The demo dataset service. Applications register their dataset on `demoDataToken`; this provider gives it the
 * accounts, roles and model services of the official plugins it finds, the settings item that guards its routes,
 * and the persisted daily Scheduler configuration that resets it.
 */
export declare class DemoDataProvider extends ServiceProvider<AppPluginApplication> {
    readonly name: string;
    private service;
    register(): void;
    boot(): Promise<void>;
    ready(): Promise<void>;
    private schedule;
    /** This process's own address, so the gateway's calls to the simulated model never leave the machine. */
    private loopbackModelUrl;
    private logger;
}
//# sourceMappingURL=demo-data.d.ts.map
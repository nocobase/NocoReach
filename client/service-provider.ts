import {
  ClientApplication,
  resolveAppBase,
  toasterToken,
} from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { connectLocale, prepareBusinessLocale } from './i18n/index.js';
import { reloadOnStaleBuild } from './lib/stale-build.js';
import { connectToaster } from './lib/toast.js';
import { createToaster } from './lib/toaster.js';
import { initialPageName } from '../shared/startup-pages.js';

export class DefaultClientServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = 'nocoreach/client';
  private previousDocumentTitle: string | undefined;
  private disconnectLocale: (() => void) | undefined;
  private stopStaleBuildReload: (() => void) | undefined;

  public override register(): void {
    this.disconnectLocale = connectLocale(this.app.runtime.i18n);
    // Public copy loads alongside identity preparation, without delaying app.start().
    // Route and chat loaders await it and own retry/error presentation if it fails.
    const name = initialPageName(resolveAppBase(), window.location.pathname);
    if (name) void prepareBusinessLocale('workspace').catch(() => undefined);
    // A tab left open across a deployment reloads into the new build instead of failing to load a page.
    this.stopStaleBuildReload = reloadOnStaleBuild();
    // What plugins and pages report through useToaster() reaches the Toaster in client/react-providers.ts from here.
    const toaster = createToaster();
    this.app.container.instance(toasterToken, toaster);
    // NocoReach's pages report through `toast` (client/lib/toast.ts), which shows on this same host.
    connectToaster(toaster);
  }

  public override boot(): Promise<void> {
    const configuredTitle = this.app.config.get<unknown>('app.title');
    const title =
      typeof configuredTitle === 'string' && configuredTitle.trim()
        ? configuredTitle.trim()
        : 'NocoReach';
    this.app.refine.setOptions({ title: { text: title } });
    this.previousDocumentTitle = document.title;
    document.title = title;
    return Promise.resolve();
  }

  public override shutdown(): Promise<void> {
    this.disconnectLocale?.();
    this.stopStaleBuildReload?.();
    if (this.previousDocumentTitle !== undefined) {
      document.title = this.previousDocumentTitle;
    }
    return Promise.resolve();
  }
}

const serviceProviders: readonly ClientServiceProviderConstructor[] = [
  DefaultClientServiceProvider,
];

export default serviceProviders;

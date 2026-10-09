// The `toast` NocoReach's pages call (classic portal: sonner), shown through the application's one toast host
// (`useToaster()`, client/react-providers.ts) so pages do not mount a second one. Connected at client start-up
// (client/service-provider.ts); before that, a message goes to the console.
import type { Toaster, ToastType } from '@nocobase/app-client';
import type { ReactNode } from 'react';

interface Options {
  readonly id?: string;
  readonly description?: ReactNode;
  readonly duration?: number;
}

let toaster: Toaster | undefined;

export function connectToaster(next: Toaster): void {
  toaster = next;
}

const show = (type: ToastType, title: ReactNode, options: Options = {}): string => {
  if (!toaster) {
    console.info(title);
    return '';
  }
  return toaster.show({ type, title, ...options });
};

export const toast = Object.assign((title: ReactNode, options?: Options) => show('info', title, options), {
  success: (title: ReactNode, options?: Options) => show('success', title, options),
  error: (title: ReactNode, options?: Options) => show('error', title, options),
  info: (title: ReactNode, options?: Options) => show('info', title, options),
  warning: (title: ReactNode, options?: Options) => show('warning', title, options),
  dismiss: (id?: string) => {
    if (id) toaster?.close(id);
  },
});

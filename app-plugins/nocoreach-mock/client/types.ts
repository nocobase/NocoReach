import type { ComponentType, ComponentProps, ReactNode } from 'react';
import type { MockStatus } from '../server/types.js';
export interface MockUiComponents {
  Page: ComponentType<{
    title: string;
    description: string;
    children: ReactNode;
  }>;
  Card: ComponentType<{
    title: string;
    description: string;
    children: ReactNode;
  }>;
  Notice: ComponentType<{
    title: string;
    children?: ReactNode;
    error?: boolean;
  }>;
  Button: ComponentType<
    ComponentProps<'button'> & {
      variant?: 'default' | 'outline' | 'destructive';
    }
  >;
  Input: ComponentType<ComponentProps<'input'>>;
  Field: ComponentType<{
    label: string;
    htmlFor: string;
    error?: string;
    hint?: string;
    children: ReactNode;
  }>;
  Select: ComponentType<{
    id: string;
    value: string;
    disabled?: boolean;
    items: { value: string; label: string }[];
    onChange: (value: string) => void;
  }>;
  Confirm: ComponentType<{
    open: boolean;
    pending: boolean;
    title: string;
    description: string;
    confirm: string;
    cancel: string;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    children?: ReactNode;
  }>;
  Loading: ComponentType<{ label: string }>;
}
export interface MockClientHost {
  components: MockUiComponents;
  useContext(): {
    projectId: string;
    role: 'admin' | 'member' | null;
    locale: string;
    scopeKey: string;
  };
  request(
    action: 'status' | 'configure' | 'reset',
    values: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<MockStatus>;
  notify: (message: string) => void;
  signIn: () => void;
  projectSettings: () => void;
}

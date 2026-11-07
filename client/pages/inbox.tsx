import type { ReactElement } from 'react';

import { InboxPage as InboxBlock } from '#extensions/nocobase-inbox/inbox-page';
import {
  defaultInboxCategories,
  type InboxRegistry,
} from '#extensions/nocobase-inbox/registry';

import { nocoReachRenderers } from './inbox/renderers';
import { nocoReachInboxSource } from './inbox/source';

/** NocoReach's contributors: its task messages and its other messages (`inbox/renderers.tsx`). */
const registry: InboxRegistry = {
  renderers: nocoReachRenderers,
  feeds: [],
  categories: defaultInboxCategories,
};

/**
 * Route `/inbox`: the UI Library's inbox block over the in-app notification plugin, reached from the header's inbox
 * button. NocoReach's source (`inbox/source.ts`) says what each of its messages is about, so a task message shows the
 * task with what can be done about it, and a message waiting for review is a decision until the task is reviewed;
 * anything else reads as a notification.
 */
export default function InboxPage(): ReactElement {
  return <InboxBlock source={nocoReachInboxSource} registry={registry} />;
}

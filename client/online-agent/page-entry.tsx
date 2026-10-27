/* eslint-disable react-refresh/only-export-components -- the entry's hook is exported beside its two buttons */
import type { ReactElement } from 'react';
import { cn } from '#lib/utils';
import { ActorAvatar } from '#components/reach/actor';
import { Button } from '#components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';
import { useProject } from '../pages/reach-data.js';
import type { OnlinePageSubject } from '../../shared/online-agent.js';
import { useOptionalOnlineChat } from './context.js';

// A page's way into the AI (2026-10-27 user decision, after inputs on pages read as a second chat): the agent's
// avatar and one line that open the chat panel, as NocoBase's AI employees do. The conversation starts informed —
// the server reads the page's data for it from `subject` (server/nocoreach/online-agent/page-context.ts) — and offers
// the page's prompts as chips. Pages keep no AI input of their own.
export type PageAiEntryProps = {
  /** The page asking and, for a row, the row; the server reads that page's data for the AI. */
  subject: OnlinePageSubject;
  /** The button's line ("Let AI adjust the rules"), also the new conversation's title. */
  label: string;
  /** One sentence under the title in the new conversation: what the AI has already read. */
  description?: string;
  /** Three or four prompts shown as chips in the new conversation; clicking one sends it. */
  presets: string[];
  disabled?: boolean;
  className?: string;
};
type Opening = Omit<PageAiEntryProps, 'disabled' | 'className'>;

/** Opens the chat panel as the entry does, for a page's own trigger; null outside the app layout. */
export function usePageAi(): ((opening: Opening) => void) | null {
  const chat = useOptionalOnlineChat(),
    { project } = useProject();
  if (!chat || !project) return null;
  return ({ subject, label, description, presets }) =>
    chat.open({
      draft: '',
      projectId: String(project.id),
      subject,
      page: { label, description, presets },
    });
}

/** The page's entry: a quiet button with the agent's avatar and its line, among the page header's actions. */
export function PageAiEntry({
  disabled,
  className,
  ...opening
}: PageAiEntryProps): ReactElement | null {
  const open = usePageAi();
  if (!open) return null;
  return (
    <Button
      variant='ghost'
      className={className}
      disabled={disabled}
      data-page-ai={opening.subject.page}
      onClick={() => open(opening)}
    >
      <ActorAvatar type='agent' size='xs' />
      {opening.label}
    </Button>
  );
}

/**
 * A row's entry: the avatar alone, named by its label on hover. It shows while the row is hovered or the button has
 * focus (always on touch screens), so the row that has it takes Tailwind's `group`.
 */
export function RowAiEntry({
  disabled,
  className,
  ...opening
}: PageAiEntryProps): ReactElement | null {
  const open = usePageAi();
  if (!open) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant='ghost'
            size='icon-xs'
            aria-label={opening.label}
            disabled={disabled}
            data-page-ai={opening.subject.page}
            className={cn(
              'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100',
              className,
            )}
            onClick={() => open(opening)}
          />
        }
      >
        <ActorAvatar type='agent' size='xs' />
      </TooltipTrigger>
      <TooltipContent>{opening.label}</TooltipContent>
    </Tooltip>
  );
}

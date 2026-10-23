import { $t } from '#i18n';
import { cn } from '#lib/utils';
import { Reveal } from '#components/reach/reveal';
import { Markdown } from '../doc-view';
import { leadOf } from './article-text';
import { text } from './styles';

// What the Agent says about its work, summary first (2026-10-23 user request: the full report ran to a screen and a
// half above the article). At most three plain lines show; the full notes open on demand.

export function AgentNotes({
  summary,
  notes,
}: {
  /** The Agent's short summary for the reviewer, when it wrote one. */
  summary?: string;
  /** The full notes (Markdown). */
  notes: string;
}) {
  const full = notes.trim(),
    short = summary?.trim() || leadOf(full);
  if (!short && !full) return null;
  return (
    <div
      className='flex min-w-0 flex-col items-start gap-2'
      data-agent-notes=''
    >
      {short ? (
        <p className={cn(text.body, 'line-clamp-3 whitespace-pre-wrap')}>
          {short}
        </p>
      ) : null}
      {full && full !== short ? (
        <Reveal label={$t('taskDetail.fullNotes')} className='w-full'>
          <Markdown content={full} />
        </Reveal>
      ) : null}
    </div>
  );
}

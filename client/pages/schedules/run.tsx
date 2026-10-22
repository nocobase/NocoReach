import { useTranslation } from '@nocobase/i18n/client';
import { runTotals, type Occurrence } from './data.js';

interface Part {
  id: string;
  text: string;
  /** Skipped or failed: worth naming even when the run had one project. */
  notable?: boolean;
  failed?: boolean;
}

/**
 * The muted line under a run's time. The suggestions sit beside the time, so a run of one project that went well
 * adds nothing here; projects are named when there are several, or when one was skipped or failed. `brief` names
 * only the skipped and failed ones, without the reason, for the list page's narrow cell.
 */
export function RunDetail({
  run,
  names,
  brief = false,
}: {
  run: Occurrence;
  names: Map<string, string>;
  brief?: boolean;
}) {
  const { t } = useTranslation();
  const { outcomes, skipped } = runTotals(run);
  if (skipped)
    return <p className='text-muted-foreground'>{t('schedules.allSkipped')}</p>;
  const name = (id: string) => names.get(id) ?? t('schedules.project', { id });
  const parts = outcomes.flatMap((item): Part[] => {
    if (item.skipped)
      return [
        {
          id: item.id,
          notable: true,
          text: t('schedules.projectSkipped', { name: name(item.id) }),
        },
      ];
    if (item.ok === false)
      return [
        {
          id: item.id,
          notable: true,
          failed: true,
          text:
            item.error && !brief
              ? t('schedules.projectFailedBecause', {
                  name: name(item.id),
                  reason: item.error,
                })
              : t('schedules.projectFailed', { name: name(item.id) }),
        },
      ];
    if (brief) return [];
    return [
      {
        id: item.id,
        text:
          item.items === undefined
            ? name(item.id)
            : `${name(item.id)} ${item.items}`,
      },
    ];
  });
  const shown =
    outcomes.length > 1 || parts.some((part) => part.notable) ? parts : [];
  const reason = run.status !== 'succeeded' ? run.reason : undefined;
  if (!reason && !shown.length) return null;
  return (
    <p
      className={
        brief
          ? 'line-clamp-2 break-words text-muted-foreground'
          : 'break-words text-muted-foreground'
      }
    >
      {reason}
      {shown.map((part, index) => (
        <span
          key={part.id}
          className={part.failed ? 'text-destructive' : undefined}
        >
          {index || reason ? ' · ' : ''}
          {part.text}
        </span>
      ))}
    </p>
  );
}

import { scheduleDay, scheduledToday } from '../schedule-time.js';

// Snooze (2026-10-28 user request, as Gmail's): a task put aside until a day keeps its progress, leaves Needs you, Current
// and every count of what waits, and comes back on that day at 09:00 in the daily analysis's time zone, its owner told
// in the app and by email. Acting on its card ends the snooze at once. The day is kept as an instant (`until`), so a
// minute check finds what is due after any restart.

export const SNOOZE_HOUR = 9;

/** 09:00 of `day` ("2026-11-11") in `timezone`, by the Jobs parser's rules (daylight saving included); null when invalid. */
export function snoozeInstant(day: string, timezone?: string): Date | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    Number.isNaN(Date.parse(`${day}T00:00:00Z`))
  )
    return null;
  // Any moment inside that day in the zone, which can be up to 14 hours from UTC.
  for (let hours = -12; hours <= 36; hours += 6) {
    const probe = new Date(Date.parse(`${day}T00:00:00Z`) + hours * 3600_000);
    if (scheduleDay(probe, timezone) === day)
      return scheduledToday(`0 ${SNOOZE_HOUR} * * *`, probe, timezone);
  }
  return null;
}

/** Commands that leave a snooze as it is: the snooze's own, and what is about the task rather than its work. */
export const KEEPS_SNOOZE = [
  'snoozeTask',
  'unsnoozeTask',
  'comment',
  'setOwner',
  'setCollaborators',
  'linkPage',
  'setAgent',
  'takeOwnership',
  'selectPlaybook',
];

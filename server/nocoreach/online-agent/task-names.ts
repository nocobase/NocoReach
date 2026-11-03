import {
  systemMessageKey,
  systemMessageText,
} from '../../../shared/i18n/messages.js';
import { resolveLocale } from '../../../shared/i18n/locales.js';
import { inPlaceLocales } from '../../../shared/article-publishing.js';
import {
  SYSTEM_PLAYBOOKS,
  stagesFor,
} from '../../../shared/playbook-catalog.js';
import type { TaskStanding } from '../../../shared/task-pending.js';
import type { Stage } from '../execution/flow.js';
import type { projectWork } from '../execution/model.js';
import locales from '../../locales/index.js';

type Work = ReturnType<typeof projectWork>;
type Origin = { id: string; name: string; system?: boolean; edited?: boolean };
/** A playbook as the project's list holds it (PlaybookStore.list). */
export type ListedPlaybook = Origin;

// The labels the task list, board and task page show for each standing (client/pages/task-status-tag.tsx).
const STANDING: Record<TaskStanding, string> = {
  todo: 'common.pending',
  doing: 'common.inProgress',
  review: 'common.needsConfirmation',
  done: 'common.completed',
  closed: 'common.closed',
  snoozed: 'common.snoozed',
};
// A built-in step whose key was replaced shows under the new one, as on the task page
// (client/pages/playbook-snapshot.ts): Review and publish became Review on 2026-10-24.
const REPLACED: Record<string, string> = {
  'playbook.reviewPublish': 'common.review',
};
// Stored system copy is matched by its message key, so older wording still counts as the built-in's.
const textKey = (value: string) => systemMessageKey(value) ?? value;
const stepNames = new Set(
  SYSTEM_PLAYBOOKS.flatMap((p) => stagesFor(p).map((s) => textKey(s.name))),
);
// A snapshot of a built-in nobody edited: marked so, or an old one stored before snapshots carried their origin.
const builtIn = (snapshot: Origin) =>
  (snapshot.system === true
    ? snapshot.edited === false
    : !('system' in snapshot) && !('edited' in snapshot)) &&
  SYSTEM_PLAYBOOKS.some(
    (p) => p.id === snapshot.id && textKey(p.name) === textKey(snapshot.name),
  );

/**
 * Playbook, step and status names in the reader's language, as the task page shows them, so the model never has to
 * name them by id. Built-in playbooks and steps are stored in their Chinese system wording and translated while
 * unedited; edited and custom ones keep their own words (client/pages/playbook-snapshot.ts, playbook-model.ts).
 */
export async function taskNames(locale: string) {
  const language = resolveLocale(locale);
  // A language other than English and Chinese registers its dictionary as its module loads.
  await locales[language]?.();
  const text = (value: string) => systemMessageText(value, {}, language);
  return {
    standing: (state: TaskStanding) => text(STANDING[state]),
    /**
     * A started task's playbook as it started; one not started yet by the playbook it would start with, from the
     * project's list, else the built-in of that id. Null when neither knows it.
     */
    playbook(work: Work, id: string, list: ListedPlaybook[] = []) {
      if (work.playbook)
        return builtIn(work.playbook)
          ? text(work.playbook.name)
          : work.playbook.name;
      const own = list.find((p) => p.id === id);
      if (own) return own.system && !own.edited ? text(own.name) : own.name;
      const system = SYSTEM_PLAYBOOKS.find((p) => p.id === id);
      return system ? text(system.name) : null;
    },
    /** A step of the task's flow, as the task page names it (client/pages/playbook-model.ts stageName). */
    step(stage: Stage, work: Work) {
      if (
        work.delivery?.translateFrom &&
        !work.release &&
        work.stage !== 'done' &&
        stage.kind === 'agent' &&
        work.flow?.stages[work.stageIndex ?? 0]?.key === stage.key
      )
        return text(
          inPlaceLocales(work.delivery, work.article?.locales).length
            ? 'articleTask.updateStep'
            : 'articleTask.translateStep',
        );
      if (stage.kind === 'release') return text('playbook.publishStage');
      if (stage.kind === 'observe') return text('common.watch');
      if (
        !work.flow ||
        !builtIn(work.flow) ||
        !stepNames.has(textKey(stage.name))
      )
        return stage.name;
      const key = systemMessageKey(stage.name);
      return text(key && REPLACED[key] ? REPLACED[key] : stage.name);
    },
  };
}
export type TaskNames = Awaited<ReturnType<typeof taskNames>>;

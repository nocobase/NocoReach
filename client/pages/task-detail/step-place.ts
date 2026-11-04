import type { StepPlace } from '../playbook-steps';
import type { TaskData } from '../task-execution-types';
import { REPO, type DeliveryChoice } from './article-model';
import { startedDelivery } from './started-model';

// Where a task changes things, for the words of View steps (PlaybookSteps' place), from what Changes go to shows:
// the start card's choice before the start, the start's record after it.

const targetNames = (data: TaskData, ids: string[]) =>
  ids
    .filter((id, i) => ids.indexOf(id) === i)
    .map((id) => data.articleTargets?.find((t) => t.id === id)?.name || id);

/** Before the start: the repository, a new article, or the article picked; unknown while it is still to be picked. */
export function choicePlace(
  data: TaskData,
  choice: DeliveryChoice,
  translate: boolean,
): StepPlace | undefined {
  if (choice.target === REPO) return { kind: 'repo' };
  const targets = targetNames(data, [
    choice.target,
    ...(translate ? [] : choice.also),
  ]);
  if (choice.mode === 'new' && !translate)
    return { kind: 'article', targets, created: true };
  // The article the start card names (pickedOf in article-start.tsx): found from the page, else saved on the task.
  const linked = data.work.article,
    picked =
      choice.article?.targetId === choice.target ||
      Boolean(linked?.articleId && linked.targetId === choice.target);
  return choice.mode === 'existing' && picked
    ? { kind: 'article', targets }
    : undefined;
}

/**
 * After the start: the article and its targets as the start froze them, else the site's repository. A new article is
 * one the start linked no article for, as the record shows it: the delivery gets the article's id once it is published.
 */
export function startedPlace(data: TaskData): StepPlace | undefined {
  const delivery = startedDelivery(data);
  if (!delivery) return undefined;
  return delivery.kind === 'article'
    ? {
        kind: 'article',
        targets: targetNames(data, delivery.targets),
        created: !delivery.pages.length,
      }
    : { kind: 'repo' };
}

import english from '../../shared/i18n/en.json';
import { systemMessageKey } from '../../shared/i18n/messages';
import type { FlowSnapshot, PlaybookSnapshot } from './playbook-model';
import { localizeWorkSnapshots } from './playbook-snapshot';

type SnapshotWork = { flow?: FlowSnapshot; playbook?: PlaybookSnapshot };
type Option = { name: string; label: string; value: string };
const englishNames: Readonly<Record<string, string>> = english;

// Keep the existing name-based facet: equal raw names span IDs and versions.
// Labels may differ within that group because only system copy is translated.
export function playbookFilterOptions(
  works: (SnapshotWork | undefined)[],
): Option[] {
  const groups = new Map<string, Set<string>>();
  for (const work of works) {
    const name = work?.playbook?.name;
    if (!work || !name) continue;
    const labels = groups.get(name) ?? new Set<string>();
    labels.add(localizeWorkSnapshots(work).playbook?.name ?? name);
    groups.set(name, labels);
  }
  const options = [...groups]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, labels]) => ({
      name,
      label: [...labels].sort().join(' / '),
      value: playbookFilterValue(name),
    }));
  // Distinguish a translated system label from a user name with the same spelling.
  return options.map((option) => ({
    ...option,
    label: options.some(
      (other) => other.name !== option.name && other.label === option.label,
    )
      ? `${option.label} (${option.name})`
      : option.label,
  }));
}

// Tag every DOM value, so arbitrary user text cannot collide with legacy values.
// The URL's new playbookName parameter stores the raw name, without this encoding.
export const playbookFilterValue = (name: string, legacy = false): string =>
  name ? JSON.stringify([legacy ? 'legacy' : 'name', name]) : '';

export function matchesPlaybookFilter(
  work: SnapshotWork | undefined,
  name: string,
  legacy: boolean,
): boolean {
  return matchesName(work?.playbook?.name ?? '', name, legacy);
}

function matchesName(raw: string, name: string, legacy: boolean): boolean {
  if (!name) return true;
  // Old links used display names. Exact dictionary aliases preserve their grouping
  // across locales, including formerly mistranslated custom names. This is URL
  // compatibility only; aliases never authorize translating a display label.
  return (
    raw === name ||
    (legacy &&
      systemMessageKey(raw) !== undefined &&
      englishNames[systemMessageKey(raw)!] === name)
  );
}

export const legacyPlaybookFilterLabel = (
  options: Option[],
  name: string,
): string =>
  [
    ...new Set(
      options
        .filter((option) => matchesName(option.name, name, true))
        .map((option) => option.label),
    ),
  ].join(' / ') || name;

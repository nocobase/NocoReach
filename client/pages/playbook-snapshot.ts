import { $legacyText, $t } from '#i18n';
import { systemMessageKey } from '../../shared/i18n/messages';
import { SYSTEM_PLAYBOOKS, stagesFor } from '../../shared/playbook-catalog';
import type { FlowSnapshot, PlaybookSnapshot } from './playbook-model';

type Origin = { id: string; system?: boolean; edited?: boolean };
const isSystemCopy = (snapshot: Origin) =>
  snapshot.system === true &&
  snapshot.edited === false &&
  SYSTEM_PLAYBOOKS.some((p) => p.id === snapshot.id);
const hasOrigin = (snapshot: Origin) =>
  'system' in snapshot || 'edited' in snapshot;
// System copy is recognized by its message key, so a step stored under its older wording (Review and publish was
// renamed in Chinese on 2026-10-22) still matches through the alias manifest. User-authored text has no key and must
// match exactly. A built-in step whose key was replaced is the same step under the new key: Review and publish became
// Review on 2026-10-24, with Publish as the step after it, so tasks started before show and match the new name.
const REPLACED: Record<string, string> = {
  'playbook.reviewPublish': 'common.review',
};
const stepKey = (value: string) => {
  const key = systemMessageKey(value);
  return key === undefined ? undefined : (REPLACED[key] ?? key);
};
const sameText = (a: string, b: string) => {
  if (a === b) return true;
  const key = stepKey(a);
  return key !== undefined && key === stepKey(b);
};
const knownText = (list: string[]) => {
  const exact = new Set(list),
    keys = new Set(list.map(stepKey).filter(Boolean));
  return {
    has: (value: string) =>
      exact.has(value) ||
      (stepKey(value) !== undefined && keys.has(stepKey(value))),
  };
};
// A stored built-in step's text in the reader's language, under its current wording.
const stepText = (value: string) => {
  const key = systemMessageKey(value);
  return key !== undefined && REPLACED[key]
    ? $t(REPLACED[key])
    : $legacyText(value);
};
const names = knownText(SYSTEM_PLAYBOOKS.map((p) => p.name));
const canonicalStages = SYSTEM_PLAYBOOKS.flatMap((p) => stagesFor(p));
const stageNames = knownText(canonicalStages.map((s) => s.name));
// A built-in step's instruction and its review items are stored as Chinese system text too (View steps on a started
// task showed them in Chinese in every language until 2026-11-04).
const instructions = knownText(
  canonicalStages.flatMap((s) => (s.instruction ? [s.instruction] : [])),
);
const checklistLabels = knownText(
  canonicalStages.flatMap((s) => (s.checklist || []).map((c) => c.label)),
);

// Compare the complete JSON shape, including unknown fields, without depending on
// property order. A version or an ID by itself is not evidence of canonical text.
function sameSnapshot(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'string' && typeof b === 'string') return sameText(a, b);
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, i) => sameSnapshot(value, b[i]))
    );
  }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const left = Object.entries(a),
    right = Object.entries(b);
  return (
    left.length === right.length &&
    left.every(([key, value]) => {
      const match = right.find(([other]) => other === key);
      return match !== undefined && sameSnapshot(value, match[1]);
    })
  );
}

// Display-only compatibility for old snapshots that omitted provenance. This is
// NOT an assertion that the user never edited the definition: a legacy import
// identical to the canonical pair is indistinguishable and displays the same way.
function isCanonicalLegacy(
  flow?: FlowSnapshot,
  playbook?: PlaybookSnapshot,
): boolean {
  if (!flow || !playbook || hasOrigin(flow) || hasOrigin(playbook))
    return false;
  const p = SYSTEM_PLAYBOOKS.find((p) => p.id === playbook.id);
  // The next steps are left out: a built-in's change over time (Keyword research gained Write blog post on
  // 2026-10-28) without making the snapshot any less the built-in's.
  const { next: _next, ...identity } = playbook;
  return Boolean(
    p &&
    sameSnapshot(identity, {
      id: p.id,
      name: p.name,
      kind: p.kind,
      version: p.version,
    }) &&
    sameSnapshot(flow, {
      id: p.id,
      name: p.name,
      version: p.version,
      stages: stagesFor(p),
    }),
  );
}

// Explicit custom/edited origin always wins. Unknown text is never passed to the
// legacy translator's fuzzy matcher, even on an explicitly system-owned snapshot.
const snapshotName = (
  snapshot: PlaybookSnapshot | FlowSnapshot,
  canonicalLegacy: boolean,
) =>
  (isSystemCopy(snapshot) || canonicalLegacy) && names.has(snapshot.name)
    ? $legacyText(snapshot.name)
    : snapshot.name;
function localizeFlowSnapshot(
  flow: FlowSnapshot,
  canonicalLegacy: boolean,
): FlowSnapshot {
  if (!isSystemCopy(flow) && !canonicalLegacy) return flow;
  return {
    ...flow,
    name: snapshotName(flow, canonicalLegacy),
    stages: flow.stages.map((stage) => ({
      ...stage,
      name: stageNames.has(stage.name) ? stepText(stage.name) : stage.name,
      ...(stage.instruction && instructions.has(stage.instruction)
        ? { instruction: stepText(stage.instruction) }
        : {}),
      ...(stage.checklist
        ? {
            checklist: stage.checklist.map((item) =>
              checklistLabels.has(item.label)
                ? { ...item, label: stepText(item.label) }
                : item,
            ),
          }
        : {}),
    })),
  };
}

// Always derive a display copy from raw state. Never persist this translated text.
export function localizeWorkSnapshots<
  T extends { flow?: FlowSnapshot; playbook?: PlaybookSnapshot },
>(work: T): T {
  const canonicalLegacy = isCanonicalLegacy(work.flow, work.playbook);
  return {
    ...work,
    ...(work.flow
      ? { flow: localizeFlowSnapshot(work.flow, canonicalLegacy) }
      : {}),
    ...(work.playbook
      ? {
          playbook: {
            ...work.playbook,
            name: snapshotName(work.playbook, canonicalLegacy),
          },
        }
      : {}),
  };
}

type Replaced = {
  id?: string;
  name?: string;
  system?: boolean;
  edited?: boolean;
  stages?: { key: string; name: string; kind: string }[];
};
// A record from before snapshots kept their origin is built-in when it bears a built-in's id and name.
const builtInRecord = (p: Replaced) =>
  p.system === true
    ? p.edited !== true
    : p.system === undefined &&
      p.edited === undefined &&
      SYSTEM_PLAYBOOKS.some(
        (x) => x.id === p.id && sameText(x.name, p.name || ''),
      );

/** A playbook a change of playbook recorded (shared/playbook-change.ts), named in the reader's language. */
export function recordedPlaybookName(p?: Replaced | null): string {
  if (!p?.name) return '';
  return builtInRecord(p) && names.has(p.name) ? $legacyText(p.name) : p.name;
}

export type PlaybookOrigin = {
  id?: string;
  system?: boolean;
  edited?: boolean;
};
/**
 * A playbook an event or a hand-over names by its stored name (Start, the playbook chosen before it, a hand-over), in
 * the reader's language when it is built-in and as typed when a person made it, even under a built-in's name. Records
 * from before they kept the playbook's origin (2026-11-12) are matched by the name alone.
 */
export function namedPlaybook(
  name?: string,
  origin?: PlaybookOrigin | null,
): string {
  if (!name) return '';
  if (origin) return recordedPlaybookName({ ...origin, name });
  return names.has(name) ? $legacyText(name) : name;
}

/** The steps of the playbook a change replaced, so Activity names its steps as they were then. */
export function recordedStages(p: Replaced) {
  const builtIn = builtInRecord(p);
  return (p.stages || []).map((s) => ({
    ...s,
    name: builtIn && stageNames.has(s.name) ? stepText(s.name) : s.name,
  }));
}

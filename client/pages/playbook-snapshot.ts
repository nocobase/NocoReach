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
// A stored built-in step name in the reader's language, under its current name.
const stepText = (value: string) => {
  const key = systemMessageKey(value);
  return key !== undefined && REPLACED[key]
    ? $t(REPLACED[key])
    : $legacyText(value);
};
const names = knownText(SYSTEM_PLAYBOOKS.map((p) => p.name));
const stageNames = knownText(
  SYSTEM_PLAYBOOKS.flatMap((p) => stagesFor(p).map((s) => s.name)),
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
    })),
  };
}

// Always derive a display copy from raw state. Never persist these translated names.
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

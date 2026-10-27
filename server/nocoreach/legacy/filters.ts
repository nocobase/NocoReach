// Classic NocoBase filter and sort inputs, as the ported NocoReach code writes them, turned into the NocoBase 3
// Repository's filter and sort ASTs. Classic accepted `{ key: 'x', payload: { $in: [...] } }`, `$and`/`$or` arrays,
// `$like` patterns and `['-createdAt']` sorts; NocoBase 3 has no `$in` or `$like`, so those become groups and string
// operators here. Anything the ported code does not use is refused loudly rather than guessed.
import type {
  FilterAst,
  FilterConditionNode,
  FilterGroupNode,
  FilterNode,
  SortAst,
} from '@nocobase/db';

type Classic = Record<string, unknown>;
type FieldTypes = ReadonlyMap<string, string>;

const DATE_COMPARISONS: Record<string, FilterConditionNode['operator']> = {
  $gt: '$dateAfter',
  $gte: '$dateNotBefore',
  $lt: '$dateBefore',
  $lte: '$dateNotAfter',
};

const OPERATORS: Record<string, FilterConditionNode['operator']> = {
  $eq: '$eq',
  $ne: '$ne',
  $gt: '$gt',
  $gte: '$gte',
  $lt: '$lt',
  $lte: '$lte',
  $startsWith: '$startsWith',
  $endsWith: '$endsWith',
  $includes: '$includes',
  $notIncludes: '$notIncludes',
  $empty: '$empty',
  $notEmpty: '$notEmpty',
  $dateBetween: '$dateBetween',
  $dateBefore: '$dateBefore',
  $dateAfter: '$dateAfter',
  $dateNotBefore: '$dateNotBefore',
  $dateNotAfter: '$dateNotAfter',
  $isTruly: '$isTruly',
  $isFalsy: '$isFalsy',
};

const group = (logic: 'and' | 'or', items: FilterNode[]): FilterGroupNode => ({
  kind: 'group',
  logic,
  items,
});

const condition = (
  path: string,
  operator: FilterConditionNode['operator'],
  value?: unknown,
): FilterConditionNode =>
  value === undefined
    ? { kind: 'condition', path: [path], operator }
    : {
        kind: 'condition',
        path: [path],
        operator,
        value: value as FilterConditionNode['value'],
      };

// A `$like` pattern with % only at the ends.
function like(path: string, pattern: string, insensitive = false): FilterNode {
  const starts = pattern.startsWith('%'),
    ends = pattern.endsWith('%');
  const text = pattern.replace(/^%/, '').replace(/%$/, '');
  if (text.includes('%') || text.includes('_'))
    throw new Error(`Unsupported $like pattern: ${pattern}`);
  const operator =
    starts && ends
      ? '$includes'
      : ends
        ? '$startsWith'
        : starts
          ? '$endsWith'
          : '$eq';
  return {
    ...condition(path, operator, text),
    ...(insensitive ? { mode: 'insensitive' as const } : {}),
  };
}

// NocoBase 3 compares booleans with $isTruly/$isFalsy only; classic wrote `{ flag: true }` or `{ flag: { $eq: true } }`.
const bool = (path: string, value: boolean, negate = false): FilterNode =>
  condition(path, value !== negate ? '$isTruly' : '$isFalsy');

function field(
  path: string,
  value: unknown,
  fieldTypes: FieldTypes,
): FilterNode[] {
  if (typeof value === 'boolean') return [bool(path, value)];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    if (Array.isArray(value))
      return [
        group(
          'or',
          value.map((v) => condition(path, '$eq', v)),
        ),
      ];
    return [
      value === null
        ? condition(path, '$empty')
        : condition(path, '$eq', value),
    ];
  }
  const out: FilterNode[] = [];
  for (const [op, v] of Object.entries(value as Classic)) {
    if (op === '$in') {
      const list = (v as unknown[]) || [];
      // An empty $in matches nothing.
      out.push(
        list.length
          ? group(
              'or',
              list.map((x) => condition(path, '$eq', x)),
            )
          : group('and', [
              condition(path, '$empty'),
              condition(path, '$notEmpty'),
            ]),
      );
    } else if (op === '$notIn') {
      for (const x of (v as unknown[]) || [])
        out.push(condition(path, '$ne', x));
    } else if (op === '$like' || op === '$iLike') {
      out.push(like(path, String(v), op === '$iLike'));
    } else if ((op === '$eq' || op === '$ne') && typeof v === 'boolean') {
      out.push(bool(path, v, op === '$ne'));
    } else if (op === '$eq' && v === null) {
      out.push(condition(path, '$empty'));
    } else if (op === '$ne' && v === null) {
      out.push(condition(path, '$notEmpty'));
    } else if (OPERATORS[op]) {
      // Use schema types, not date-looking strings: sync partition dates are strings.
      const type = fieldTypes.get(path);
      const operator =
        type === 'date' || type === 'datetime' || type === 'datetimeTz'
          ? (DATE_COMPARISONS[op] ?? OPERATORS[op])
          : OPERATORS[op];
      // Classic timestamp comparisons also accepted date-only bounds (monthly budgets).
      // ECMAScript date-only inputs mean UTC midnight; keep that boundary explicit.
      const bound =
        (type === 'datetime' || type === 'datetimeTz') &&
        DATE_COMPARISONS[op] &&
        typeof v === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(v)
          ? `${v}T00:00:00.000Z`
          : v;
      out.push(condition(path, operator, bound));
    } else {
      throw new Error(`Unsupported filter operator ${op} on ${path}`);
    }
  }
  return out;
}

function nodes(filter: Classic, fieldTypes: FieldTypes): FilterNode[] {
  const out: FilterNode[] = [];
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;
    if (key === '$and' || key === '$or') {
      const items = ((value as Classic[]) || []).map((f) =>
        group('and', nodes(f, fieldTypes)),
      );
      out.push(group(key === '$and' ? 'and' : 'or', items));
    } else {
      out.push(...field(key, value, fieldTypes));
    }
  }
  return out;
}

export function toFilter(
  filter: Classic | undefined,
  filterByTk?: unknown,
  fieldTypes: FieldTypes = new Map(),
): FilterAst | undefined {
  const items = filter ? nodes(filter, fieldTypes) : [];
  if (filterByTk !== undefined && filterByTk !== null)
    items.push(condition('id', '$eq', filterByTk));
  if (!items.length) return undefined;
  return { kind: 'filter', version: 1, root: group('and', items) };
}

export function toSort(sort: unknown): SortAst {
  const input = (Array.isArray(sort) ? sort : sort ? [sort] : []) as string[];
  const list = [...input];
  // Every bridged collection has an ID. Equal timestamps must not reshuffle pages.
  if (!list.some((s) => s.replace(/^-/, '') === 'id')) list.push('id');
  return {
    kind: 'sort',
    version: 1,
    items: list.map((s) => ({
      kind: 'field' as const,
      path: [s.replace(/^-/, '')],
      direction: s.startsWith('-') ? ('desc' as const) : ('asc' as const),
    })),
  };
}

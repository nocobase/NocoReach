/** Absolute timestamp contract. Never let the host timezone interpret a wall clock. */
export function timestamp(value: unknown): string | null {
  if (value === null) return null;
  if (
    value instanceof Date ||
    typeof value === 'number' ||
    (typeof value === 'string' && /^-?\d{12,16}(?:\.0+)?$/.test(value))
  ) {
    const epoch = value instanceof Date ? value.getTime() : Number(value);
    const date = new Date(epoch);
    if (
      Number.isSafeInteger(epoch) &&
      date.getUTCFullYear() >= 1000 &&
      date.getUTCFullYear() <= 9999
    )
      return date.toISOString();
    throw new Error('Invalid timestamp');
  }
  if (typeof value !== 'string') throw new Error('Invalid timestamp');
  const m = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/,
  );
  if (!m) throw new Error('Timestamp requires an explicit offset');
  const calendar = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const zone = m[8];
  if (
    +m[1] < 1000 ||
    calendar.getUTCFullYear() !== +m[1] ||
    calendar.getUTCMonth() !== +m[2] - 1 ||
    calendar.getUTCDate() !== +m[3] ||
    +m[4] > 23 ||
    +m[5] > 59 ||
    +m[6] > 59 ||
    zone === '-00:00' ||
    (zone !== 'Z' &&
      (+zone.slice(1, 3) > 14 ||
        +zone.slice(4) > 59 ||
        (+zone.slice(1, 3) === 14 && +zone.slice(4) !== 0)))
  )
    throw new Error('Invalid timestamp');
  const absolute = new Date(value.replace(' ', 'T'));
  if (absolute.getUTCFullYear() < 1000 || absolute.getUTCFullYear() > 9999)
    throw new Error('Invalid timestamp');
  return absolute.toISOString();
}

/** Resolve a proven IANA source zone; reject DST folds and gaps instead of choosing. */
export function wallTimestamp(value: string, timeZone: string): string {
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?$/,
  );
  if (!match) throw new Error('Invalid wall timestamp');
  const wall = `${match[1]}T${match[2]}.${(match[3] || '').padEnd(3, '0')}`;
  const target = Date.parse(timestamp(`${wall}Z`)!);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const local = (epoch: number) => {
    const parts = Object.fromEntries(
      formatter.formatToParts(epoch).map((p) => [p.type, p.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  };
  const offsets = new Set<number>();
  const wholeSecond = Math.floor(target / 1000) * 1000;
  for (let hour = -48; hour <= 48; hour++) {
    const sample = wholeSecond + hour * 3600000;
    offsets.add(Date.parse(`${local(sample)}Z`) - sample);
  }
  const candidates = [...offsets]
    .map((offset) => target - offset)
    .filter((epoch) => local(epoch) === wall.slice(0, 19));
  if (candidates.length !== 1)
    throw new Error(
      candidates.length
        ? 'Ambiguous wall timestamp'
        : 'Nonexistent wall timestamp',
    );
  return new Date(candidates[0]).toISOString();
}

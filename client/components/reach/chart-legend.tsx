import type { SVGProps } from 'react';
import { Legend, type LegendPayload } from 'recharts';

type SeriesStyle = Pick<
  SVGProps<SVGElement>,
  | 'stroke'
  | 'strokeWidth'
  | 'strokeDasharray'
  | 'strokeLinecap'
  | 'strokeOpacity'
  | 'fill'
  | 'fillOpacity'
  | 'opacity'
>;

export function ChartLegendContent({
  payload = [],
  order,
}: {
  payload?: readonly LegendPayload[];
  order: readonly string[];
}) {
  const rank = (entry: LegendPayload) => {
    const index = order.indexOf(String(entry.dataKey));
    return index < 0 ? order.length : index;
  };
  const entries = payload
    .filter((entry) => entry.type !== 'none' && !entry.inactive)
    .sort((a, b) => rank(a) - rank(b));

  return (
    <ul className='flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-foreground'>
      {entries.map((entry) => {
        // Recharts includes the series drawing props in each legend entry.
        const style = (entry.payload ?? {}) as SeriesStyle;
        return (
          <li key={String(entry.dataKey)} className='flex items-center gap-1.5'>
            <svg
              width='32'
              height='14'
              viewBox='0 0 32 14'
              aria-hidden='true'
              className='shrink-0'
              opacity={style.opacity}
            >
              {style.fill &&
              style.fill !== 'none' &&
              style.fillOpacity != null ? (
                <rect
                  x='1'
                  y='4'
                  width='30'
                  height='9'
                  fill={style.fill}
                  fillOpacity={style.fillOpacity}
                />
              ) : null}
              <line
                x1='1'
                y1='4'
                x2='31'
                y2='4'
                stroke={style.stroke ?? entry.color}
                strokeWidth={style.strokeWidth}
                strokeDasharray={style.strokeDasharray}
                strokeLinecap={style.strokeLinecap}
                strokeOpacity={style.strokeOpacity}
              />
            </svg>
            <span>{entry.value}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function ChartLegend({ order }: { order: readonly string[] }) {
  return (
    <Legend itemSorter={null} content={<ChartLegendContent order={order} />} />
  );
}

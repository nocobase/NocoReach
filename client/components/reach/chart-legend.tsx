import {
  createContext,
  useContext,
  useState,
  type ComponentProps,
  type SVGProps,
} from 'react';
import {
  Area,
  Bar,
  ComposedChart,
  Legend,
  Line,
  type LegendPayload,
} from 'recharts';

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
  hiddenKeys = new Set<string>(),
  onToggle,
}: {
  payload?: readonly LegendPayload[];
  order: readonly string[];
  hiddenKeys?: ReadonlySet<string>;
  onToggle?: (key: string) => void;
}) {
  const rank = (entry: LegendPayload) => {
    const index = order.indexOf(String(entry.dataKey));
    return index < 0 ? order.length : index;
  };
  const entries = payload
    .filter(
      (entry) =>
        entry.type !== 'none' &&
        (!entry.inactive || hiddenKeys.has(String(entry.dataKey))),
    )
    .sort((a, b) => rank(a) - rank(b));

  return (
    <ul className='flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-foreground'>
      {entries.map((entry) => {
        // Recharts includes the series drawing props in each legend entry.
        const style = (entry.payload ?? {}) as SeriesStyle;
        return (
          <li key={String(entry.dataKey)}>
            <button
              type='button'
              className='flex cursor-pointer items-center gap-1.5 rounded-sm px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[pressed=false]:opacity-40 aria-[pressed=false]:line-through'
              aria-pressed={!entry.inactive}
              onClick={() => onToggle?.(String(entry.dataKey))}
            >
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
                (style.fillOpacity != null || entry.type === 'rect') ? (
                  <rect
                    x='1'
                    y='4'
                    width='30'
                    height='9'
                    fill={style.fill}
                    fillOpacity={style.fillOpacity ?? 1}
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
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function ChartLegend({ order }: { order: readonly string[] }) {
  const { hiddenKeys, toggle } = useContext(SeriesVisibilityContext);
  return (
    <Legend
      itemSorter={null}
      content={
        <ChartLegendContent
          order={order}
          hiddenKeys={hiddenKeys}
          onToggle={toggle}
        />
      }
    />
  );
}

const SeriesVisibilityContext = createContext<{
  hiddenKeys: ReadonlySet<string>;
  toggle?: (key: string) => void;
}>({ hiddenKeys: new Set() });

// Keep hidden series mounted so Recharts retains their legend entries while excluding
// them from its default tooltip and axis domains. State belongs to this chart only.
export function TrendChart({
  as: Chart = ComposedChart,
  children,
  ...props
}: ComponentProps<typeof ComposedChart> & { as?: typeof ComposedChart }) {
  const [hiddenKeys, setHiddenKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggle = (key: string) =>
    setHiddenKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <SeriesVisibilityContext value={{ hiddenKeys, toggle }}>
      <Chart {...props}>{children}</Chart>
    </SeriesVisibilityContext>
  );
}

function useSeriesHidden(props: { dataKey?: unknown; hide?: boolean }) {
  const { hiddenKeys } = useContext(SeriesVisibilityContext);
  return props.hide || hiddenKeys.has(String(props.dataKey));
}

export function ChartLine(props: ComponentProps<typeof Line>) {
  return <Line {...props} hide={useSeriesHidden(props)} />;
}

export function ChartArea(props: ComponentProps<typeof Area>) {
  return <Area {...props} hide={useSeriesHidden(props)} />;
}

export function ChartBar(props: ComponentProps<typeof Bar>) {
  return <Bar {...props} hide={useSeriesHidden(props)} />;
}

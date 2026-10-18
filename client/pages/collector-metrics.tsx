import { $t } from '#i18n';
import { Card } from '#components/ui/card';
import { MetricTile, type Metric } from './data-parts';

export function ReportMetrics({ kpis }: { kpis: Metric[] }) {
  return (
    <div
      className={
        kpis.length > 4
          ? 'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5'
          : 'grid grid-cols-2 gap-3 lg:grid-cols-4'
      }
    >
      {kpis.map((m) => (
        <Card key={m.key} className='gap-0 p-4' data-metric={m.key}>
          {/* Labels follow the page language, not the server's default copy. */}
          <MetricTile m={{ ...m, label: $t(`collectorView.${m.key}`) }} />
        </Card>
      ))}
    </div>
  );
}

import { cleanup, render, screen, within } from '@testing-library/react';
import { Area, ComposedChart, Line } from 'recharts';
import { afterEach, expect, it } from 'vitest';

import { ChartLegend } from '#components/reach/chart-legend';

afterEach(cleanup);

it('matches real series styles and keeps the main metric first across conditional series updates', () => {
  function Chart({ preliminary }: { preliminary: boolean }) {
    return (
      <ComposedChart
        width={500}
        height={240}
        data={[{ value: 10, previous: 8, fresh: 12 }]}
      >
        <ChartLegend order={['value', 'previous', 'fresh']} />
        <Area
          dataKey='value'
          name='Z main'
          stroke='var(--chart-3)'
          fill='var(--chart-3)'
          fillOpacity={0.1}
          isAnimationActive={false}
        />
        <Line
          dataKey='previous'
          name='B previous'
          stroke='var(--muted-foreground)'
          strokeWidth={2}
          strokeDasharray='4 4'
          isAnimationActive={false}
        />
        {preliminary ? (
          <Line
            dataKey='fresh'
            name='A preliminary'
            stroke='var(--chart-3)'
            strokeDasharray='2 3'
            isAnimationActive={false}
          />
        ) : null}
        <Line dataKey='helper' name='Hidden helper' legendType='none' />
        <Line dataKey='hidden' name='Hidden series' hide />
      </ComposedChart>
    );
  }
  const { rerender } = render(<Chart preliminary />);
  const entries = screen.getAllByRole('listitem');
  expect(entries.map((entry) => entry.textContent)).toEqual([
    'Z main',
    'B previous',
    'A preliminary',
  ]);
  const main = within(entries[0]).getByText('Z main').closest('li')!;
  expect(main.querySelector('line')?.getAttribute('stroke')).toBe(
    'var(--chart-3)',
  );
  expect(main.querySelector('line')?.hasAttribute('stroke-dasharray')).toBe(
    false,
  );
  expect(main.querySelector('rect')?.getAttribute('fill')).toBe(
    'var(--chart-3)',
  );
  expect(main.querySelector('rect')?.getAttribute('fill-opacity')).toBe('0.1');
  expect(
    entries[1].querySelector('line')?.getAttribute('stroke-dasharray'),
  ).toBe('4 4');
  expect(entries[1].querySelector('line')?.getAttribute('stroke-width')).toBe(
    '2',
  );
  expect(entries[1].querySelector('rect')).toBeNull();
  expect(
    entries[2].querySelector('line')?.getAttribute('stroke-dasharray'),
  ).toBe('2 3');
  expect(entries[2].querySelector('rect')).toBeNull();
  expect(screen.queryByText('Hidden helper')).toBeNull();
  expect(screen.queryByText('Hidden series')).toBeNull();
  rerender(<Chart preliminary={false} />);
  expect(
    screen.getAllByRole('listitem').map((entry) => entry.textContent),
  ).toEqual(['Z main', 'B previous']);
  rerender(<Chart preliminary />);
  expect(
    screen.getAllByRole('listitem').map((entry) => entry.textContent),
  ).toEqual(['Z main', 'B previous', 'A preliminary']);
});

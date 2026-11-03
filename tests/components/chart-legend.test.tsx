import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { ComposedChart, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { afterEach, expect, it } from 'vitest';

import {
  ChartLegend,
  TrendChart,
  ChartArea as Area,
  ChartBar as Bar,
  ChartLine as Line,
} from '#components/reach/chart-legend';

afterEach(cleanup);

it('matches real series styles and keeps the main metric first across conditional series updates', () => {
  function Chart({ preliminary }: { preliminary: boolean }) {
    return (
      <TrendChart
        as={ComposedChart}
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
          strokeOpacity={0.5}
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
      </TrendChart>
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
  expect(entries[1].querySelector('line')?.getAttribute('stroke-opacity')).toBe(
    '0.5',
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

it('toggles each series with accessible controls, rescales axes and filters the tooltip', async () => {
  const { container } = render(
    <TrendChart
      as={LineChart}
      width={600}
      height={300}
      data={[
        { day: 'Mon', low: 5, high: 1000 },
        { day: 'Tue', low: 10, high: 2000 },
      ]}
    >
      <XAxis dataKey='day' />
      <YAxis />
      <Tooltip />
      <ChartLegend order={['low', 'high']} />
      <Line dataKey='low' name='Today' isAnimationActive={false} />
      <Line
        dataKey='high'
        name='Today (preliminary)'
        isAnimationActive={false}
      />
    </TrendChart>,
  );
  const low = screen.getByRole('button', { name: 'Today', exact: true });
  const high = screen.getByRole('button', {
    name: 'Today (preliminary)',
    exact: true,
  });
  const ticks = () =>
    [
      ...container.querySelectorAll(
        '.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value',
      ),
    ].map((node) => Number(node.textContent));
  await waitFor(() =>
    expect(container.querySelectorAll('.recharts-line-curve')).toHaveLength(2),
  );
  expect(low.getAttribute('aria-pressed')).toBe('true');
  expect(high.getAttribute('aria-pressed')).toBe('true');
  expect(Math.max(...ticks())).toBeGreaterThanOrEqual(2000);
  fireEvent.click(high);
  await waitFor(() =>
    expect(container.querySelectorAll('.recharts-line-curve')).toHaveLength(1),
  );
  expect(high.getAttribute('aria-pressed')).toBe('false');
  expect(low.getAttribute('aria-pressed')).toBe('true');
  await waitFor(() => expect(Math.max(...ticks())).toBeLessThan(20));
  fireEvent.keyDown(screen.getByRole('application'), { key: 'ArrowRight' });
  await waitFor(() =>
    expect(container.querySelector('.recharts-tooltip-wrapper')).not.toBeNull(),
  );
  const tooltip = container.querySelector('.recharts-tooltip-wrapper')!;
  await waitFor(() => expect(tooltip.textContent).toContain('Today'));
  expect(tooltip.textContent).not.toContain('preliminary');
  fireEvent.click(low);
  await waitFor(() =>
    expect(container.querySelectorAll('.recharts-line-curve')).toHaveLength(0),
  );
  expect(screen.getAllByRole('button')).toHaveLength(2);
  expect(container.querySelector('.recharts-surface')).not.toBeNull();
  fireEvent.click(high);
  await waitFor(() =>
    expect(container.querySelectorAll('.recharts-line-curve')).toHaveLength(1),
  );
  expect(low.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(low);
  await waitFor(() =>
    expect(container.querySelectorAll('.recharts-line-curve')).toHaveLength(2),
  );
});

it('keeps chart state independent and retains hidden area and bar legend entries', async () => {
  function Chart({ fresh }: { fresh: boolean }) {
    return (
      <TrendChart width={400} height={240} data={[{ a: 8, b: 4, c: 12 }]}>
        <ChartLegend order={['a', 'b', 'c']} />
        <Area dataKey='a' name='Area' isAnimationActive={false} />
        <Bar dataKey='b' name='Bar' isAnimationActive={false} />
        <>
          {fresh ? (
            <Line dataKey='c' name='Fresh' isAnimationActive={false} />
          ) : null}
        </>
      </TrendChart>
    );
  }
  const { rerender } = render(
    <>
      <Chart fresh />
      <Chart fresh />
    </>,
  );
  fireEvent.click(screen.getAllByRole('button', { name: 'Area' })[0]);
  fireEvent.click(screen.getAllByRole('button', { name: 'Bar' })[0]);
  fireEvent.click(screen.getAllByRole('button', { name: 'Fresh' })[0]);
  for (const name of ['Area', 'Bar', 'Fresh']) {
    const buttons = screen.getAllByRole('button', { name });
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
  }
  rerender(
    <>
      <Chart fresh={false} />
      <Chart fresh />
    </>,
  );
  expect(screen.getAllByRole('button', { name: 'Fresh' })).toHaveLength(1);
  rerender(
    <>
      <Chart fresh />
      <Chart fresh />
    </>,
  );
  expect(
    screen
      .getAllByRole('button', { name: 'Fresh' })[0]
      .getAttribute('aria-pressed'),
  ).toBe('false');
});

// @vitest-environment node
import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import {
  google,
  propertyId,
} from '../../server/nocoreach/demo-data/world/google';
import { World } from '../../server/nocoreach/demo-data/world/world';

const metrics = [
  'sessions',
  'engagedSessions',
  'activeUsers',
  'totalUsers',
  'newUsers',
  'keyEvents',
  'conversions',
  'eventCount',
  'userEngagementDuration',
  'screenPageViews',
  'engagementRate',
  'averageSessionDuration',
  'bounceRate',
  'sessionKeyEventRate',
  'screenPageViewsPerSession',
];
const cases = [
  {
    dimensions: ['date', 'sessionSourceMedium', 'deviceCategory'],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 17,
    offset: 3,
  },
  {
    dimensions: ['hour', 'eventName'],
    dimensionFilter: {
      andGroup: {
        expressions: [
          {
            filter: {
              fieldName: 'pagePath',
              stringFilter: { matchType: 'BEGINS_WITH', value: '/docs' },
            },
          },
          {
            notExpression: {
              filter: {
                fieldName: 'countryId',
                inListFilter: { values: ['US'] },
              },
            },
          },
        ],
      },
    },
  },
  {
    dimensions: ['dateHour', 'eventName'],
    dateRanges: [
      { startDate: '2026-10-27', endDate: '2026-10-29', name: 'current' },
      { startDate: '2026-10-27', endDate: '2026-10-28', name: 'previous' },
    ],
  },
  {
    dimensions: [],
    dimensionFilter: {
      filter: { fieldName: 'hour', stringFilter: { value: '03' } },
    },
  },
  {
    dimensions: ['city'],
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { value: '/does-not-exist' },
      },
    },
  },
];

// These response digests were recorded on origin/main f55023ac before changing the aggregator.
// They cover exact row order, rounding, weighted ratios, totals, filters, paging and overlapping ranges.
test.each(['en-US', 'zh-CN'])(
  'preserves GA4 response semantics for %s',
  async (language) => {
    const hashes = [];
    for (const domain of ['acme.example', 'crm.acme.example']) {
      const world = new World(
        { id: 'parity', domain, name: 'Acme', language },
        Date.parse('2026-10-29T08:00:00Z'),
      );
      for (const spec of cases) {
        const response = google(
          world,
          new URL(
            `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId(world)}:runReport`,
          ),
          {
            method: 'POST',
            body: JSON.stringify({
              dateRanges: [{ startDate: '2026-10-27', endDate: '2026-10-29' }],
              metricAggregations: ['TOTAL'],
              ...spec,
              dimensions: spec.dimensions.map((name) => ({ name })),
              metrics: metrics.map((name) => ({ name })),
            }),
          },
        );
        expect(response?.status).toBe(200);
        hashes.push(
          createHash('sha256')
            .update(await response!.text())
            .digest('hex'),
        );
      }
    }
    expect(hashes).toMatchSnapshot();
  },
);

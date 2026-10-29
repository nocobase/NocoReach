## Demo data: stream analytics and retire project caches

- Stream Google Analytics facts into aggregation while preserving report history, filters, totals and ratios.
- Bound visit and world caches, invalidate removed or replaced projects, and evict older worlds without flushing unrelated projects.
- Keep the most recent month of daily visits and answer repeated GA4 reports within the hour from a bounded cache, so live demo pages do not recompute them.
- Page attachment and inbox cleanup while preserving retryable blob deletion, unrelated notifications and active-work protection.

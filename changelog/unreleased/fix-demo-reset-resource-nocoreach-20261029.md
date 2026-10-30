## Demo data: stream analytics and retire project caches

- Stream Google Analytics facts into aggregation while preserving report history, filters, totals and ratios.
- Bound visit and world caches, invalidate removed or replaced projects, and evict older worlds without flushing unrelated projects.
- Keep two years of each day's visits in compact columns and add them up directly, so year-long Website views and syncs read each day once instead of reallocating it per report; answer repeated GA4 reports within the hour from a bounded cache, so a sync computes each report once for all its pages.
- Page attachment and inbox cleanup while preserving retryable blob deletion, unrelated notifications and active-work protection.

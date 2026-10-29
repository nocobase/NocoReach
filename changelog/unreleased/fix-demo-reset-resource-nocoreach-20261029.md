## Demo data: bound reset memory and stream analytics aggregation

- Aggregate demo Google Analytics facts incrementally while preserving response ordering, filters, hourly/event dimensions, totals and ratios. Keep only a bounded day of visit buckets instead of retaining visits and derived facts for the entire history.
- Invalidate cached worlds when projects are removed or replaced, replace old hourly editions, and evict the least recently used world without flushing unrelated projects.
- Page attachment and inbox cleanup while preserving retryable blob deletion, unrelated notifications and active-work protection.
- Add full-application, opt-in reset resource regression coverage with isolated databases/storage, fixed fixtures, five resets, resource budgets and a separate annual-report stress phase. Record the baseline and changed measurements and their limits in the benchmark report.

## Insights: overlap small reads without delaying the state

- Insights starts reading the current situation, the key metrics and the day's conversations together with its state. The larger task list starts after the state, avoiding competing downloads when returning to Insights. Each early read is handed over once; reloads, analysis refreshes, complete history, permissions and freshness stay unchanged.
- Insights operation IDs use the shared UUID helper so decisions also work over ordinary HTTP.

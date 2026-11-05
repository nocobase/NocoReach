## Insights: the waiting tasks are asked for with the state

- Insights asked for its tasks only once its state had arrived and the page had mounted, and "Waiting for you" is the last block to fill, so the page was ready one round trip after the state. The tasks are now asked for together with the state, the current situation and the key metrics, and still once per load. On a slow link their download shares the bandwidth with the state's.

## Insights: opening again on the state last shown, without stale reads

- Opening Insights again while a read of the last visit was still out no longer sends a second read that a later refresh would answer with old data.
- Unjudged changes are judged only on the state and tasks the visit read, not on the ones last shown.
- A failed read of the state offers a retry that reads the state only, and its error goes once a later read succeeds.

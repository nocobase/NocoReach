## Demo data test on a fixed day

- `tests/nocoreach/demo-data-app.test.ts` runs on a fixed day (2026-10-29). The demo's synthetic traffic is keyed by calendar date while its observation windows sit a set number of days before today, so the conclusion a measured task reaches changed from day to day: on 2026-10-30 Acme CRM's flat task measured "up" and the outcome-coverage check failed on `main` and on every open pull request. The clock still advances from that day, so timeouts and timestamps behave as before.

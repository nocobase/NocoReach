## Data sources: aggregate connection states and reuse successful checks

- The Data sources catalog reads all connection states in one request instead of eighteen independent requests.
- Successful checks are reused for ten minutes per application, project, session or scoped API key, and language. Expired results remain available while one background refresh runs; failed checks retain the previous result and retry after thirty seconds.
- Every aggregate read checks current permissions for each source. Connection changes invalidate affected cached states across sessions, and existing individual endpoints and CLI response shapes remain compatible.

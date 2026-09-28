# Third-party source notices

- `apps/portal` is derived from the installed NocoBase Portal default template (template package version 3.1.1), including its UI components and registered extensions. Existing source headers are retained. Dependency licensing remains governed by each dependency's license; no new blanket license is assigned by this import.
- `plugins/connections/server/google-client.js` and `google-sync.js` reuse NocoBase Google connector code supplied with the old installation.
- `plugins/connections/server/research-adapter.js` adapts the old research query builder/parser. Original NocoBase copyright and AGPL/commercial-license headers are retained.
- The connector package declares AGPL-3.0 and targets NocoBase server 3.0.0-alpha.7. Source layout changes from `dist/server` to `server` in this repository; runtime code is preserved.

This private baseline does not establish that every bundled component can be redistributed under one license. Review upstream and commercial licensing before public release or redistribution. NocoBase core, commercial plugin packages, installed dependencies, credentials and data are not included.

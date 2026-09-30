# Third-party source notices

- `apps/portal` is derived from the installed NocoBase Portal default template (template package version 3.1.1), including its UI components and registered extensions. Existing source headers are retained. Dependency licensing remains governed by each dependency's license; no new blanket license is assigned by this import.
- `plugins/connections/server/google-client.js` and `google-sync.js` reuse NocoBase Google connector code supplied with the old installation.
- `plugins/connections/server/research-adapter.js` adapts the old research query builder/parser. Original NocoBase copyright and AGPL/commercial-license headers are retained.
- The connector package declares AGPL-3.0 and targets NocoBase server 3.0.0-alpha.7. Source layout changes from `dist/server` to `server` in this repository; runtime code is preserved.

This private baseline does not establish that every bundled component can be redistributed under one license. Review upstream and commercial licensing before public release or redistribution. NocoBase core, commercial plugin packages, installed dependencies, credentials and data are not included.

## M0 internal component adaptation (2026-09-30)

`apps/portal/src/components/reach-detail-layout.tsx` is adapted from `nocobase/NocoProject`, commit `f7bceeaab43deb0f09136bc40bcc9f378a2fd573`, file `nocoproject/client/components/np-detail-layout.tsx`. The export and data attribute were renamed and initial viewport measurement was added. Existing source comments are retained. This is internal reuse in this private product at the user’s direction; no permissive redistribution license is asserted. The CLI declares private / UNLICENSED; its daemon and echo implementation were not copied. The M0 execution proof is independently authored. OpenSEO source was not copied in M0; future copies must preserve its MIT notice and copyright (2026 Ben Senescu).

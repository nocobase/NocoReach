# Third-party source notices

- `apps/portal` is derived from the installed NocoBase Portal default template (template package version 3.1.1), including its UI components and registered extensions. Existing source headers are retained. Dependency licensing remains governed by each dependency's license; no new blanket license is assigned by this import.
- `plugins/connections/server/google-client.js` and `google-sync.js` reuse NocoBase Google connector code supplied with the old installation.
- `plugins/connections/server/research-adapter.js` adapts the old research query builder/parser. Original NocoBase copyright and AGPL/commercial-license headers are retained.
- The connector package declares AGPL-3.0 and targets NocoBase server 3.0.0-alpha.7. Source layout changes from `dist/server` to `server` in this repository; runtime code is preserved.

This private baseline does not establish that every bundled component can be redistributed under one license. Review upstream and commercial licensing before public release or redistribution. NocoBase core, commercial plugin packages, installed dependencies, credentials and data are not included.

## M0 internal component adaptation (2026-09-30)

`apps/portal/src/components/reach-detail-layout.tsx` is adapted from `nocobase/NocoProject`, commit `f7bceeaab43deb0f09136bc40bcc9f378a2fd573`, file `nocoproject/client/components/np-detail-layout.tsx`. The export and data attribute were renamed and initial viewport measurement was added. Existing source comments are retained. This is internal reuse in this private product at the user’s direction; no permissive redistribution license is asserted. The CLI declares private / UNLICENSED; its daemon and echo implementation were not copied. The M0 execution proof is independently authored. OpenSEO source was not copied in M0; future copies must preserve its MIT notice and copyright (2026 Ben Senescu).

## NocoReach Agent program (2026-10-01)

`apps/agent/src/claude.ts` is adapted from `nocobase/NocoProject`, commit `a023441`, `nocoproject-cli/src/daemon/adapters/claude.ts` and `spawn.ts` (stream-json launch, line parsing, process-group kill). Tool restrictions per step, environment stripping and the NocoReach protocol are independently authored; the rest of `apps/agent` (repository handling, checks, prompt, runner, CLI) is written for NocoReach following NocoProject's daemon structure. Internal reuse in this private product at the user's direction; no redistribution license is asserted.

## Interface standard and theme presets (2026-10-01)

The portal follows the NocoSolution frontend standard (`nocobase/NocoSolution` `guidelines/frontend-standard.md`, referenced, not copied). `apps/portal/src/theme/presets.css` and `apps/portal/src/theme/tones.css` are adapted from `nocobase/NocoProject` commit `a023441` (`client/theme/themes/compact.css`, `default.css`, `client/np-tones.css`, tone prefix renamed to `nr-`); `apps/portal/src/components/reach/page.tsx`, `tag.tsx` and `states.tsx` follow NocoProject's `page-container`, `page-header`, `np-section`, `np-tag`, `np-tones` and `np-states`. Internal reuse in this private product at the user's direction; no redistribution license is asserted.

## OpenSEO data pages (2026-10-02)

Ported from `every-app/open-seo`, commit `db8bde1` (MIT License, Copyright (c) 2026 Ben Senescu). Each ported file names its source in its header comment.

- `apps/portal/src/components/seo/`: `data-table.tsx`, `table-selection.ts`, `sortable-header.tsx`, `table-pagination.tsx`, `table-bulk-action-bar.tsx`, `data-table-toolbar.tsx` (from `src/client/components/table/`), `stat-tile.tsx` (`StatTile.tsx`), `card-shell.tsx` (`CardShell.tsx`), `csv.ts` (`src/client/lib/csv.ts`, `exportRows.ts`). Adapted to NocoReach's ui components, Chinese copy, unused options removed; csv written without papaparse.
- `apps/portal/src/pages/search-performance.tsx` from `src/client/features/search-performance/` (page, parts, columns, text filters): data from NocoReach's daily sync instead of live Search Console calls, NocoReach's range picker, an added trend chart, no device or country filters, CSV only.
- `apps/portal/src/pages/data-overview.tsx` follows the card layout of `src/client/features/dashboard/` (layout only; content is NocoReach's).
- `plugins/connections/server/search-performance.js` reimplements `src/server/features/gsc/searchPerformanceReport.ts` (totals, striking distance) over synced rows.

MIT License

Copyright (c) 2026 Ben Senescu

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

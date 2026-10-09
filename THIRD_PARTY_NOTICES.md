# Third-party source notices

- The removed `apps/portal` baseline was derived from the installed NocoBase Portal default template (template package version 3.1.1), including its UI components and registered extensions. Existing source headers are retained. Dependency licensing remains governed by each dependency's license; no new blanket license is assigned by this import.
- `apps/nocoreach/server/providers/reach/domain/google-client.cjs` and `google-sync.cjs` reuse NocoBase Google connector code supplied with the old installation.
- `apps/nocoreach/server/providers/reach/domain/research-adapter.cjs` adapts the old research query builder/parser. Original NocoBase copyright and AGPL/commercial-license headers are retained.
- The removed connector package declared AGPL-3.0 and targeted NocoBase server 3.0.0-alpha.7. Its reused domain code now lives in apps/nocoreach/server/providers/reach/domain; original copyright and license notices remain applicable.

This private baseline does not establish that every bundled component can be redistributed under one license. Review upstream and commercial licensing before public release or redistribution. NocoBase core, commercial plugin packages, installed dependencies, credentials and data are not included.

## M0 internal component adaptation (2026-09-30)

`apps/nocoreach/client/components/reach-detail-layout.tsx` is adapted from `nocobase/NocoProject`, commit `f7bceeaab43deb0f09136bc40bcc9f378a2fd573`, file `nocoproject/client/components/np-detail-layout.tsx`. The export and data attribute were renamed and initial viewport measurement was added. Existing source comments are retained. This is internal reuse in this private product at the user’s direction; no permissive redistribution license is asserted. The CLI declares private / UNLICENSED; its daemon and echo implementation were not copied. The M0 execution proof is independently authored. OpenSEO source was not copied in M0; future copies must preserve its MIT notice and copyright (2026 Ben Senescu).

## NocoReach Agent program (2026-10-01)

`apps/agent/src/claude.ts` is adapted from `nocobase/NocoProject`, commit `a023441`, `nocoproject-cli/src/daemon/adapters/claude.ts` and `spawn.ts` (stream-json launch, line parsing, process-group kill). Tool restrictions per step, environment stripping and the NocoReach protocol are independently authored; the rest of `apps/agent` (repository handling, checks, prompt, runner, CLI) is written for NocoReach following NocoProject's daemon structure. Internal reuse in this private product at the user's direction; no redistribution license is asserted.

## Interface standard and theme presets (2026-10-01)

The portal follows the NocoSolution frontend standard (`nocobase/NocoSolution` `guidelines/frontend-standard.md`, referenced, not copied). `apps/nocoreach/client/theme/presets.css` and `apps/nocoreach/client/theme/tones.css` are adapted from `nocobase/NocoProject` commit `a023441` (`client/theme/themes/compact.css`, `default.css`, `client/np-tones.css`, tone prefix renamed to `nr-`); `apps/nocoreach/client/components/reach/page.tsx`, `tag.tsx` and `states.tsx` follow NocoProject's `page-container`, `page-header`, `np-section`, `np-tag`, `np-tones` and `np-states`. Internal reuse in this private product at the user's direction; no redistribution license is asserted.

## OpenSEO data pages (2026-10-02)

Ported from `every-app/open-seo`, commit `db8bde1` (MIT License, Copyright (c) 2026 Ben Senescu). Each ported file names its source in its header comment.

- `apps/nocoreach/client/components/seo/`: `data-table.tsx`, `table-selection.ts`, `sortable-header.tsx`, `table-pagination.tsx`, `table-bulk-action-bar.tsx`, `data-table-toolbar.tsx` (from `src/client/components/table/`), `stat-tile.tsx` (`StatTile.tsx`), `card-shell.tsx` (`CardShell.tsx`), `csv.ts` (`src/client/lib/csv.ts`, `exportRows.ts`). Adapted to NocoReach's ui components, Chinese copy, unused options removed; csv written without papaparse.
- `apps/nocoreach/client/pages/search-performance.tsx` from `src/client/features/search-performance/` (page, parts, columns, text filters): data from NocoReach's daily sync instead of live Search Console calls, NocoReach's range picker, an added trend chart, no device or country filters, CSV only.
- `apps/nocoreach/client/pages/data-overview.tsx` follows the card layout of `src/client/features/dashboard/` (layout only; content is NocoReach's).
- `apps/nocoreach/client/components/seo/intent-badge.tsx` (`IntentBadge.tsx`), `score-badge.tsx` (`table/ScoreBadge.tsx`), `tag-chip.tsx` (`saved-keywords/TagChip.tsx`, `src/shared/tag-colors.ts`), and the filter group and range filter in `data-table-toolbar.tsx`.
- `apps/nocoreach/client/pages/keyword-research.tsx` from `src/client/features/keywords/` (page, search bar, results, table, filters, OverviewStats, AreaTrendChart, SerpAnalysisCard) and `apps/nocoreach/client/pages/saved-keywords.tsx` from `src/routes/_app/p/$projectId/saved.tsx` and `src/client/features/saved-keywords/` (table, filters, tag filter, bulk tags modal, manage tags): one keyword and market per search, results through NocoReach's DataForSEO layer, a site-rank column, details in a drawer, hand-off to the Agent, Chinese copy.
- `apps/nocoreach/client/pages/domain-overview.tsx` from `src/client/features/domain/` (page, search card, keywords and pages tabs and tables): backlinks left out, one paid query per tab, a site-click column for the own domain, Chinese copy.
- `apps/nocoreach/client/pages/rank-tracking-tab.tsx` from `src/client/features/rank-tracking/` (table, trend chart, check confirmation): weekly desktop checks only, started from saved keywords, Chinese copy.
- `apps/nocoreach/client/pages/site-audit.tsx` follows `src/client/features/audit/` (results by severity with affected pages; layout only): checks come from NocoReach's own page reading (`apps/nocoreach/server/providers/reach/domain/audit.cjs`), no Lighthouse.
- `apps/nocoreach/client/pages/ai-search.tsx` from `src/client/features/ai-search/` (Brand Lookup and Prompt Explorer pages, results, share of voice, cited sources, answers): both mention platforms at once, our pages marked from the project's domains, hand-off to the Agent, Chinese copy. `apps/nocoreach/server/providers/reach/domain/ai-search.cjs` follows `src/server/features/ai-search/services/` and `src/server/lib/dataforseo/{ai,llm-models}.ts` (request shapes, model catalog pick, measured prices): no top_pages call, no extra paid retry.
- `apps/nocoreach/client/pages/lighthouse-card.tsx` follows `src/client/features/lighthouse/` (scores, metrics, failing checks; layout only) and `apps/nocoreach/server/providers/reach/domain/lighthouse.cjs` follows `src/server/lib/dataforseo/lighthouse.ts` and `src/server/lib/lighthouseStoredPayload.ts` (request, failing-check rules): one page when asked, scores, metrics and failing checks kept, Chinese names for common checks.
- `apps/nocoreach/server/providers/reach/domain/search-performance.cjs` reimplements `src/server/features/gsc/searchPerformanceReport.ts` (totals, striking distance) over synced rows.

MIT License

Copyright (c) 2026 Ben Senescu

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## nocobase/nocobase3 应用（2026-10-09）

`apps/nocoreach` 由官方 `@nocobase/create-app` 与 `@nocobase/app-template-default@1.0.0-beta.56` 生成；框架包及官方 UI 扩展的归属与许可证遵循其各自包声明。`client/extensions/nocobase-ai` 来自新框架官方 UI registry。迁入的 NocoReach 业务页面与业务模块来源于本仓库 `apps/portal`、`plugins/connections`，保留其已有第三方归属。

旧版 Portal 模板及迁移来源路径为历史归属说明；被替代源码可在 Git 提交 `ac9addb430a0b3c70f09f526a8bcb67658f2d1c4` 中查阅。

import { t, type L } from './types.js';

/**
 * What visitors search on each demo site (2026-11-10 step 2b, GA4's view_search_results over the last 28 days):
 * [term, searches, people]. Acme's site has GA4 site search off, so Analysis rules explains how to turn it on; Acme
 * CRM's visitors search for a few things its site has no page on.
 */
export type SiteSearchTerm = readonly [
  term: L,
  searches: number,
  people: number,
];

export const ACME_SITE_SEARCH: readonly SiteSearchTerm[] = [];

export const CRM_SITE_SEARCH: readonly SiteSearchTerm[] = [
  [t('合并重复联系人', 'merge duplicate contacts'), 73, 46],
  [t('邮件模板', 'email templates'), 41, 29],
  [t('合并联系人', 'merge contacts'), 22, 17],
  [t('线索评分', 'lead scoring'), 26, 19],
  [t('导入联系人', 'import contacts'), 38, 27],
  [t('佣金', 'commission'), 12, 9],
  [t('API 限流', 'api rate limit'), 6, 3],
];

import { ACME_PAGES } from '../../acme-content.js';
import { t, type Site } from './types.js';

export const MAIN_SITE: Site = {
  name: 'Acme',
  domain: 'acme.example',
  tagline: t(
    '让任务、排期与团队协作清晰可见',
    'Make tasks, schedules and teamwork clear',
  ),
  sessions: { zh: 1680, en: 2140 },
  pages: ACME_PAGES,
  missing: ['/docs/integrations/webhooks-old'],
};

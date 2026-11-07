## Pages: the page drawer opens at once, whatever the range

- Each synced day of Search Console and GA4 page data is now also kept summed by page, so the page drawer reads one page's days by key. On a site with about 24,000 addresses each page opened took 3.7–5.8 s, with every other request waiting; a page now opens in tens of milliseconds for any range, including all time.
- After an upgrade the synced days are summed in the background from the data already stored, with no new Google request. Until a day is summed, the drawer works it out for the page as before.
- The drawer's answer is no longer saved with the project's saved reports, so opening many pages no longer pushes Pages' and Search performance's saved copies out.

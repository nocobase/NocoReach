## Pages: the page drawer opens without holding the server

- The page drawer's daily traffic and search clicks are summed once for every page of the window, grouped by page, and each page is looked up in them. On a site with about 24,000 addresses each page opened took 3.7–5.8 s, with every other request waiting; now the first page of a window takes 1.2–1.9 s, read a few days at a time, and each other page about 50–150 ms.
- The drawer's answer is no longer saved with the project's saved reports, so opening many pages no longer pushes Pages' and Search performance's saved copies out.
- A new index on synced partitions answers how many days a window has stored and their last write, which Pages, Keywords and the page drawer read on every request (about 50 ms to 3 ms on SQLite).

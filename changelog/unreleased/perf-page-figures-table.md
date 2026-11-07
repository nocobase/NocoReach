## Pages: figures of long ranges summed from the page × day table

- Pages' visits and search figures are summed by the database from the page × day table the page drawer reads, instead of reading every synced day of Search Console and GA4 page data. On 252's data (84 days, about 24,000 addresses) a range takes 0.2–0.5 s on SQLite instead of 0.3–1.6 s, and longer synced histories no longer make every range change parse their JSON (about 1.3 MB a day).
- The table keeps each row as numbers, with addresses and sources in tables of their own: 84 days of 252's data take 26 MB on Postgres with the indexes and addresses instead of 44 MB, a row about 85 bytes instead of about 220.
- After the upgrade the table is summed again in the background from the data already stored, with no Google request; until then Pages and the drawer sum the days not yet held from the synced data, as before.
- Right after the upgrade, until that fill has finished (about 11 s on 252), the first Pages read of a range is slower than before (3–4.5 s on 252's data on SQLite).

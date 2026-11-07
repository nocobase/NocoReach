## Pages: the page drawer opens without holding the server

- The page drawer's daily traffic and search clicks are summed once for every page of the window and each page is looked up in them. At 8,000 query × page rows a day, each page opened took about three seconds, with every other request waiting; the first page of a window now takes about one second, read a few days at a time, and each other page about 30 ms.
- A new index on synced partitions answers how many days a window has stored and their last write, which Pages, Keywords and the page drawer read on every request (about 50 ms to 3 ms on SQLite).

## Keywords, Pages, Search performance and Traffic open without waiting

- Keywords no longer sums a month of Search Console rows each time it opens: the site ranks are kept in memory and read ahead after each sync, so the page and every other request stop waiting several seconds on a large site.
- Pages sends less than half of what it did when the range changes, keeps showing the previous range's table while the new one loads, and sums each range's figures once instead of after every sync write.
- Ranges you choose other than the default (Traffic's All time, Search performance's last 90 days, Pages' ranges) are read ahead in the background for a few days, so opening them again does not wait for Google. Today's card is ready on the day's first visit.
- The site icon in the header shows the saved icon at once while it is read again, and a task's start card and the memory sources dialog reuse a recent lookup instead of asking the CMS or the website each time.

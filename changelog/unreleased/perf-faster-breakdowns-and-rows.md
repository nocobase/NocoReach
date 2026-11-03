## Search performance and Traffic: breakdowns and row details answer at once on a new day; realtime is read every minute only while shown

- Country / region, Device and Search appearance, a query's or page's detail and a Traffic row's detail answer a new day's date range from the previous day's while the new one is read, like the rest of the page, and the detail names the period it holds. A copy older than seven days is still never shown.
- Traffic reads GA4's reports nine at a time instead of five, so a report that has to be read waits about three round-trips instead of five.
- Traffic's Today card reads realtime visitors every half hour and shows when it read them; opening its details reads at once and then every minute, as before. A Traffic page left open no longer makes seven GA4 requests a minute.

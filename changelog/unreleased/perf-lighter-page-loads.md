## Pages: lighter task list and strategy state, no wait for realtime

- Insights, Opportunities, Tasks and Pages ask for a page view of the task list and the strategy state (`view: 'page'`). It leaves out the analysis copy in each task, each result's content, the plans' evidence and most of each earlier analysis. Other callers still get the stored rows.
- Signed-in pages mount without waiting for the realtime connection. NocoReach patches the authorization plugin's client so that the connection opening and its permission topics becoming ready read the permissions again once, and invalidate them only when they changed. A permission event still invalidates at once, and a connection that cannot be made no longer locks the application.
- The shell no longer remounts when the signed-in member is known, which sent every page's reads twice.
- The task list is shared by Insights, Opportunities, Tasks and Pages: a page opened after another shows the list that one read while it reads it again. Opportunities shows the Insights state the same way.
- Traffic's Today card reads only its realtime figures and minutes (two GA4 requests instead of seven); the details read the whole view while they are open.
- Search Console reports keep their Google access token for 45 minutes, as GA4 reports already did, instead of refreshing it on every report the cache misses.

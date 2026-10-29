## Insights: the metric cards share one dated window

- The five metric cards on Insights cover one window: the latest 7 days that every shown source has complete (Search Console and GA4 land two or three days late), against the 7 days before. GitHub and the other sources no longer end on a later day than Google.
- The line above the cards gives that window's dates, written as the data pages write their range ("Oct 19 to Oct 25 · compared with the previous 7 days"), instead of "Last 7 days".
- Each card opens its page on those exact dates.
- `nrDataViews:overview` takes `sameWindow` for this; without it each source keeps its own cutoff, as the data pages, the daily analysis and the chat read it.
- Key events, on the cards and on the daily analysis's chips, open Website directly: the old `/website/conversion` address redirected there without the query, so the period was lost.

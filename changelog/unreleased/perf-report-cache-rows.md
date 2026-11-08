## Faster saved reports and menu checks on large projects

- Saving a Google report (Traffic, Search performance, Pages' figures) writes that report alone instead of every saved report of the project again: each had rewritten up to 8 MB, every few minutes on the Hong Kong instance.
- The menu and Data health no longer read a project's whole website content (4.5 and 10 MB on the Hong Kong instance) on every poll to learn whether a site is connected; on that instance the menu's check took about a second at each poll.
- Pages' figures for long ranges of a large site are kept again instead of being summed on every read: with 16 months of page history they had outgrown the saved report's size limit.

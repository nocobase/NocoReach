## Start card test waits for the page titles

- The start card test added with several website repositories (#324) checked the page links before the page lookup had answered, so under load it found the pages still listed by address and failed, which stopped the Studio deployment of #324. It now waits for the titled links, and its lookup answers after a short delay as the server does.

## Data sources: Bilibili and Xiaohongshu as optional collector sources

- The Bilibili and Xiaohongshu cards say what they read and what they need ("Requires a self-hosted collector", and a signed-in browser for Xiaohongshu) before they are connected, and show Connected once a source is connected, like the other sources. The Xiaohongshu card is named "Xiaohongshu".
- Their drawers follow the YouTube drawer: what the source reads, what it needs (with a link to the deployment guide), what is not read, the search terms with Edit, the five most recently found videos or notes, Read now, and View data, Clear collected data and Disconnect at the bottom. Search terms are edited in a dialog. The upstream-mode sentence and the second Refresh button are gone.
- Once a collector is set up, its settings fold into one row ("Collector · address", with "Connection working" after a read got through); Edit opens the existing form in a dialog.
- Bilibili reads every day by default (Read automatically every day), takes up to five search terms, and reads at once after the first save. Clearing collected data switches daily reading off.
- A collector busy with another read no longer counts as a failure: the read is queued and retried about ten minutes later, up to three times. Platform refusals wait for the next day. Three failed reads in a row pause Bilibili's daily reading, and the drawer and Data sources › Data health say why; a successful read resumes it.
- Xiaohongshu still reads only on Read now, with the same busy retry.
- Bilibili has a row in Data sources › Data health.

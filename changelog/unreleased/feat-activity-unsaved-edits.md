## Tasks: changes to an article under review show in Activity before they are a version

- While someone has changed the article in its review card without Approve or Request changes, Activity ends with a line naming who and when, as "Tian Qi edited the article draft, not saved as a version yet (AI rewrites: 2)", or "You" for your own. Its View brings the review card into view. Once the changes become a version the line gives way to that version's line; once they are discarded it goes.
- Everyone who may read the task sees the line, including people who may not edit the article: the task read (`nrTaskWork:get` and every command's answer) carries who saved the changes, when and how many AI rewrites they hold (`unversionedEdits`), never the changes themselves.
- The review card names the person who saved the changes it shows, as Activity does, until you change them yourself: after taking over a colleague's changes it reads "Version 4 + changes by Tian Qi" instead of "your changes".

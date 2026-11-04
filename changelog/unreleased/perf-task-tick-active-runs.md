## Task tick: read only the runs with work left

- The task tick, every two seconds, reads by key the runs a Runner or the demo simulation still owes an answer for, instead of every task run ever written with all its content. Each tick held the whole server while it read: 220 milliseconds with 1,000 finished runs and 5.2 seconds with 5,000, when NocoReach's other timers stopped. Its cost no longer grows with the number of finished runs.
- Runs written outside the task service are found by a scan of ids every ten minutes and when the application starts, which reads the content only of runs it has not seen finished; a classic import asks for one at once. A run in flight when the application restarts is still followed.

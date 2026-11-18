## Dependencies: Demo Mode 0.2.0-beta.11 and App Server 5.0.0-beta.4

- Demo Mode moves to 0.2.0-beta.11: in a demo, each visitor's language choice stays in their own browser session instead of changing the shared demo account's language for everyone signed in as it. The plugin and its pages are also translated into Russian and Korean.
- NocoBase moves to App Server 5.0.0-beta.4, App Client 4.0.0-beta.10, Agents 2.0.0-beta.11, Authentication 2.0.0-beta.20, Authorization 1.0.0-beta.37, Users 2.0.0-beta.19, Jobs 1.0.0-beta.6, Queue 1.0.0-beta.11 and the plugin releases that accept them.
- Deployments that override `jobs` or `queue` in `config.yml` or Studio variables must move each named configuration under `backends` (`jobs.backends.memory`, `jobs.backends.redis`), keeping `default` beside it; the old top-level entries now stop the application from starting. NocoReach's own defaults are already moved.
- Chat attachments keep the 20 MB limit, now read from the Drive disk (`drive.disks.<disk>.maxFileSizeMb`); a too-large file is refused with `FILE_TOO_LARGE`.

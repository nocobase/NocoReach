## Upgrades: Demo Mode 0.2.0-beta.6, Agents 2 and App Server 3.0.0-beta.5

- Upgrade Demo Mode to `0.2.0-beta.6`, with durable daily reset claims, bounded retries and recovery of interrupted resets.
- Move Agents to `2.0.0-beta.0`, App Server to `3.0.0-beta.5`, App Client to `4.0.0-beta.5`, DB, Jobs, Queue, Lifecycle, Authentication, Notification, Notification Providers, Mail and Scheduler with it, keeping one resolved copy of each; rebase the Scheduler patch onto `1.0.0-beta.21` unchanged.
- Declare only memory Jobs and Queue configurations. Redis Jobs and Queue now need the commercial `@nocobase/app-plugin-jobs-redis` and `@nocobase/app-plugin-queue-redis` plugins, so a deployment that selects Redis without them stops at startup instead of falling back.
- Stop documenting `agents.vectors`, which Agents 2 removes: an active value stops startup.

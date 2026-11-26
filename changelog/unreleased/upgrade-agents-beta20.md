## Agents 2.0.0-beta.20 and the framework release it needs

- Upgrade Agents to `2.0.0-beta.20` together with the `@nocobase/*` versions of Default Template `2.0.0-beta.3` (App Server `5.0.0-beta.11`, App Client `4.0.0-beta.13`), Demo Mode `0.2.0-beta.15`, Runner `0.1.0-beta.34` and CLI Client `0.1.0-beta.26` (wire protocol 18). Deploy the application before updating runners.
- Keep the pages and header buttons the plugins now bring (Agent panel, `/chat`, `/inbox`, Mail, System and Personal settings) out of NocoReach, which has its own.
- Re-apply NocoReach's Authorization and Scheduler patches to `1.0.0-beta.40` and `1.0.0-beta.27`.
- Jobs and Queue configurations move under `backends`; a `config.yml` that declares one moves it too.
- Roles that manage agents keep the new `agents.skills` settings item when saved; the Runtimes tab stays open to every member.
- A task run stopped because its authorization ended no longer shows `[REDACTED]` as its reason.

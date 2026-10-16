# Application access, phase 1

The framework permission-set service is the only role store. `nr.admin` and `nr.member` preserve classic application-wide membership. A default framework `member` assignment grants no NocoReach access. Root remains a system administrator; business administrators receive an explicit catalogue rather than root, user administration, arbitrary framework settings or classic import privileges. Business membership also requires an enabled person, or an application-associated organization service identity.

## Grants and boundaries

`server/access/catalog.ts` builds the finite action catalogue from registered resources and task command/execute actions. A business grant uses resource type `nocoreach`, action `nrResource.action`, and resource id equal to a project ID. `*` covers all projects and application actions; `$app` selects only application actions. Project selections are data boundaries inside an application membership, not separate project memberships. Multiple framework assignments combine their grants. Custom business sets use the `nr.` prefix and policyless explicit grants; management checks the grantor's corresponding actions/data and rejects unrelated system grants.

Every legacy dispatcher request checks the catalogue before invoking a handler, including handlers with no old `requireAccess` call. Request-local state reuses membership and authorization results; it expires when the request finishes. Project lists are filtered item by item. Global configuration ignores client-supplied project selectors. Owner, revision, review, task state, OAuth initiator and existing object checks remain in their domains. Task execution rechecks a fresh current execute grant before preparation/claim and before consuming results; preparing outside the Agents transaction uses the public subject context hook. No runner protocol fields, persistent coordination state or claim locks are added.

Human-facing Agents/Scheduler authorization requires current business membership. Generic run details for NocoReach task subjects also check the real project. The generic mixed-project run list requires application-wide task read; project-limited users must use the filtered NocoReach task list. Explicit lists of other subject kinds retain plugin checks. Shared retry/cancel endpoints refuse NocoReach task subjects so their business commands preserve stage/review semantics. Runner protocol authentication is unchanged. Conversation context references and people providers remain application-owned.

Pages have explicit framework `page/access` identities in `shared/access-pages.ts`; official plugin settings retain their own grants. Frontend visibility never authorizes an API request. Phase 2 must present role configuration and multi-role editing; the current member API supports role arrays and the existing page retains its basic member/admin controls.

## Credentials and storage

The installed `ScopedApiKeys` owns secret hashing, permission storage, parsing, expiration, rotation and revocation. The application registers business scope levels and project objects, intersects key actions/objects with current identity grants, and never duplicates personal key scopes. Root cannot bypass key restrictions. Account endpoints cannot be called with API keys. Supplying both credentials cannot fall back to cookie privileges; legacy unscoped keys fail authentication. Generic API-key mutation/signing endpoints are closed in favor of the controlled service; the default configuration's session conversion is retained.

New schema contains only `nrOrganizationKeys` (key ID, independent service user, creator, creation time) and `nrAccessEvents` (management changes). A creator is provenance, not an organization key's lifetime owner. Person membership/owner selection and submitted task owners exclude service identities. Personal keys cease business access when the person loses membership or is disabled. Revoke deletes the credential while retaining its management event.

`ReachKeys` constructs the public credential service using `auth.forConnection(connection)`, binding credential changes and application audit to the same transaction. Tests inject audit failure and verify that rotation restores the old secret and migration restores legacy credentials. Empty/unbounded scopes are rejected; maximum lifetime is 365 days, default 90. Rotation immediately replaces the secret without a grace period.

## Controlled HTTP entry points

All paths below are relative to `/api`, require a signed-in authorized administrator and return the standard `{data}` envelope. Secret responses use `Cache-Control: no-store`. Origin/CSRF protection remains enabled.

| Method/path                          | Input/purpose                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| `GET /nocoreachKeys/inventory`       | Safe credential metadata only; no hashes or secrets                            |
| `GET /nocoreachKeys/events?limit=50` | Bounded management history, maximum 100                                        |
| `POST /nocoreachKeys`                | `name`, `type: personal                                                        | organization`, optional personal `userId`, organization `roles`, `expiresInDays`and mandatory`scope` |
| `POST /nocoreachKeys/rotate`         | `keyId`, `ownerId`; secret returned once, old secret immediately invalid       |
| `POST /nocoreachKeys/revoke`         | `keyId`, `ownerId`; no secret response                                         |
| `POST /nocoreach/nrMembers/setRole`  | `userId` and `roles` array; existing `role` alias remains for the current page |

Example scope: `{"groups":{"nocoreach.business":{"level":"read","objects":["123"]}}}`. Read/write/admin are finite catalogue subsets, not system roles. `nocoreach.import/admin` is a separate system-administrator-only scope. A key with project selection cannot operate application-wide configuration. Scope creation checks issuer grants and current personal owner grants. Organization roles are checked again inside creation before assignment. Expired/stopped/legacy keys return 401; valid keys outside action/data scope return 403, or the domain's existing 404 where existence is hidden.

## Migration and verification

`202610160002_create_access_records` is a new reversible schema migration. The application startup upgrade then atomically creates built-in permission sets, maps every legacy person assignment, disables old enabled unscoped default API keys and writes `nr-migrations:access:20261016` plus one event. Unknown roles, missing/non-person users or conflicting pre-existing built-ins abort the transaction/startup. The classic snapshot is retained unchanged for backup comparison. Normal management never dual-writes it. Explicit classic import projects its membership snapshot into framework assignments in the import transaction and preserves the migration marker.

Use the [operator cutover procedure](ACCESS-CUTOVER.md). Schema down alone cannot undo framework assignments or credential retirement. Repeat startup is a no-op. Framework active-person protection prevents removing/disabling the last business administrator; root's independent framework guard preserves the system entry point.

Relevant tests: `access-keys-app.test.ts` (real app), `access-migration.test.ts` (schema up/down/redo), `agents-app.test.ts`, `task-flow.test.ts`, OAuth/import, online Agents and schedule suites. `access.browser.ts` drives an English real development app with disposable synthetic accounts/data; it writes screenshots only to the task temporary directory and removes its database/config afterward.

## Cost and delivery boundaries

A measured local SQLite task-list request issued 9 SELECTs/0 writes with cookie login, and 16 SELECTs/2 existing credential-use writes with a scoped key; both used zero transactions/locks. These are whole-request counts, not additional queries attributed solely to this change; timing in one test run was about 9/21 ms. The authorization layer adds current account/assignment reads, request-local grant resolution and in-memory scope checks, with no application audit write on ordinary reads. Other plugin routes can independently verify a key and update its existing usage metadata; do not extrapolate the legacy-dispatcher measurement to every route.

Per runner preparation/claim, the application additionally resolves current account/assignments/grants for actor and distinct owner before entering the claim transaction. The isolated execution-authorization sample issued 5 SELECTs, 0 writes, 0 transactions and 0 locks per identity (about 3 ms locally); a distinct owner repeats that check. It adds no writes/locks, timers, polling or heartbeat work. Management/invitation work is not on this path. Role changes, migration and key management use short existing database transactions and write actual changed assignments/credentials plus one event.

Phase 2 owns member invitations (7 days), multi-role/role management interfaces and their browser/error flows. Phase 3 owns full personal/organization key self-service pages. Neither is implemented here. PostgreSQL concurrency, production-scale latency, mail, production integration inventory/window and all later UI paths require separate verification. No production cutover or integration notification is performed by this change.

## Deploy release images through a signed webhook

- Deploy the verified internal image digest after Release succeeds and report the server's deployment result in CI without SSH credentials.
- Add a single-application deployment service with signed requests, replay protection, persistent job state, serialized updates, database/file backups and migration-aware failure handling.
- Keep the current and previous successful images and three successful pre-deployment backups; preserve failed-deployment recovery artifacts and skip images referenced by other containers or repositories.

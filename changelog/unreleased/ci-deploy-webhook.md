## Trigger deployment after publishing release images

- Call the deployment API with the verified release version and image digest after image publication succeeds.
- Authenticate requests, poll deployment status, and fail CI when deployment fails or returns a different release identity.

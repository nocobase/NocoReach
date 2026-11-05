## Publish the latest internal image tag

- Publish `latest` alongside the version tag, including prereleases, and verify that both resolve to the same registry digest.
- Serialize image publication and skip updating `latest` when a higher application version is already published, so recovery of older releases cannot move the tag backward.

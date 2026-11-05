## Release images in the internal container registry

- Publish a Linux amd64 NocoReach image from the tested release archive after the Release workflow creates a version, independently of Solutions deployment.
- Include PostgreSQL in production dependencies, validate release and artifact identity, and record the published image digest.
- Document registry credentials, manual publication recovery and versioned image upgrades with persistent configuration and data.

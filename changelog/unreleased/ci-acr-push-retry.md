## Release: image publication retries a stalled registry push

- The Release workflow's image job tries each Alibaba Cloud registry call (login, push, pull and moving `latest`) up to three times, stopping an attempt that stalls: ten minutes for the push, two for the others. A stalled layer upload no longer holds the job for an hour and skips the production deployment, as it did for v1.0.0-beta.91.

## Release: a failed Studio deployment is retried

- When Studio reports the release deployment as failed, the release workflow waits 30 seconds and deploys the same, already uploaded release again, up to twice, instead of failing at once. A Studio that cannot be reached while the deployment is followed is asked again after 30 seconds. The archive upload itself is still never repeated.

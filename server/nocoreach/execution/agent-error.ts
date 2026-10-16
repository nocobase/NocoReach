/** Expected Agent configuration failures may stop PR cleanup without rolling back task cancellation. */
export class TaskAgentUnavailableError extends Error {
  readonly status = 409;
}

/**
 * Stable error reasons this plugin returns, in the `databaseExplorer` domain.
 * They are part of the HTTP contract, so a client branches on them instead of
 * parsing a message.
 */
export type DatabaseExplorerErrorCode =
  | 'DATABASE_UNAVAILABLE'
  | 'DATABASE_EXPLORER_FORBIDDEN'
  | 'CONNECTION_NOT_FOUND'
  | 'CONNECTION_UNAVAILABLE'
  | 'CONNECTION_UNREACHABLE'
  | 'SCHEMA_READ_DENIED'
  | 'COLLECTION_NOT_FOUND'
  | 'INVALID_LIST_OPTIONS'
  | 'INVALID_CURSOR';

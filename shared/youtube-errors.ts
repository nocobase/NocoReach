// Exact application-owned messages; upstream text must remain literal.
export const youtubeSystemErrors = [
  'youtube.collectorNotConfigured',
  'youtube.collectorAmbiguous',
  'youtube.collectorUnauthorized',
  'youtube.collectorUnreachable',
  'youtube.collectorUnsupported',
  'youtube.collectorProxyMigration',
  'youtube.collectorBusy',

  'youtube.invalidInput',
  'youtube.toolMissing',
  'youtube.accessRestricted',
  'youtube.videoUnavailable',
  'youtube.networkError',
  'youtube.toolError',
  'youtube.upstreamError',
  'youtube.timeout',
  'youtube.outputLimit',
  'youtube.invalidResponse',
  'youtube.cancelled',
  'youtube.configChanged',
  'youtube.partialCaptions',
] as const;

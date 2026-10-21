// What a request that got no answer says, by why it failed and whether it went through the proxy (NETWORK-EGRESS §3.3).
// The server writes these sentences with the host as {0}; the client recognizes them in errors, including stored ones,
// to show them in the current language with a way to Settings › Network.

/** Why a request got no answer, in terms Settings › Network and connection errors can explain. */
export type NetworkFailureReason =
  'timeout' | 'reset' | 'refused' | 'dns' | 'certificate' | 'other';

export const networkFailureMessages = {
  direct: {
    timeout: 'outboundNetwork.failures.directTimeout',
    reset: 'outboundNetwork.failures.directReset',
    refused: 'outboundNetwork.failures.directRefused',
    dns: 'outboundNetwork.failures.directDns',
    other: 'outboundNetwork.failures.directOther',
  },
  proxy: {
    timeout: 'outboundNetwork.failures.proxyTimeout',
    reset: 'outboundNetwork.failures.proxyReset',
    refused: 'outboundNetwork.failures.proxyRefused',
    dns: 'outboundNetwork.failures.proxyDns',
    other: 'outboundNetwork.failures.proxyOther',
  },
  // A certificate is not trusted whichever way the request went.
  certificate: 'outboundNetwork.failures.certificate',
} as const;

export function networkFailureKey(
  reason: NetworkFailureReason,
  proxied: boolean,
): string {
  if (reason === 'certificate') return networkFailureMessages.certificate;
  return networkFailureMessages[proxied ? 'proxy' : 'direct'][reason];
}

/** Every failure message with what it says, for recognizing them in text. */
export const networkFailureEntries: readonly {
  key: string;
  reason: NetworkFailureReason;
  proxied: boolean;
}[] = [
  ...(['direct', 'proxy'] as const).flatMap((route) =>
    Object.entries(networkFailureMessages[route]).map(([reason, key]) => ({
      key,
      reason: reason as NetworkFailureReason,
      proxied: route === 'proxy',
    })),
  ),
  {
    key: networkFailureMessages.certificate,
    reason: 'certificate',
    proxied: false,
  },
];

/** Accept a complete SemVer baseline, with at most one optional v prefix. */
export function formatTemplateVersion(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const version = value.trim().replace(/^v/, '');
  const numeric = '(?:0|[1-9]\\d*)';
  const prerelease = `(?:${numeric}|\\d*[A-Za-z-][0-9A-Za-z-]*)`;
  const semver = new RegExp(
    `^${numeric}\\.${numeric}\\.${numeric}(?:-${prerelease}(?:\\.${prerelease})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`,
  );
  // 0.0.0 is the old placeholder, not evidence of an adopted template release.
  if (!semver.test(version) || version === '0.0.0') return undefined;
  return `v${version}`;
}

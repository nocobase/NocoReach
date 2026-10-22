// Keep invalid external references literal instead of aborting collection or rendering.
export function decodeHtmlNumericReference(
  reference: string,
  digits: string,
  radix: 10 | 16,
): string {
  const point = Number.parseInt(digits, radix);
  return Number.isSafeInteger(point) && point >= 0 && point <= 0x10ffff
    ? String.fromCodePoint(point)
    : reference;
}

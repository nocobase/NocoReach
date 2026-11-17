// Reading images from public addresses: what a read asks for, and what the bytes are, whatever the response says.

/** A read of an image asks for the types a task takes (never AVIF or SVG). */
export const IMAGE_ACCEPT =
  'image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.5';

/** The task image type bytes start with, whatever the address or the response says; null for anything else. */
export function imageTypeOf(bytes: Buffer): string | null {
  const is = (offset: number, value: string) =>
    bytes.subarray(offset, offset + value.length).toString('latin1') === value;
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return 'image/jpeg';
  if (is(0, 'GIF87a') || is(0, 'GIF89a')) return 'image/gif';
  if (is(0, 'RIFF') && is(8, 'WEBP')) return 'image/webp';
  return null;
}

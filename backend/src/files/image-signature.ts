/** Header classification only. Not image decoding, malware detection or full-file integrity. */
export const IMAGE_PREFIX_BYTES = 16;
export function detectImageMime(bytes: Uint8Array): string | null {
  const has = (offset: number, signature: readonly number[]) => bytes.length >= offset + signature.length && signature.every((value, i) => bytes[offset + i] === value);
  const ascii = (offset: number, text: string) => has(offset, [...text].map((char) => char.charCodeAt(0)));
  if (has(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (has(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return 'image/gif';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP') && ['VP8 ', 'VP8L', 'VP8X'].some((chunk) => ascii(12, chunk))) return 'image/webp';
  return null;
}

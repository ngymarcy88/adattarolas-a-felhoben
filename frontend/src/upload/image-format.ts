import { UploadRequestError } from '../api/uploads';

export const IMAGE_HEADER_BYTES = 16;
export type ImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
const formats: Record<ImageMime, { label: string; extensions: string[] }> = {
  'image/jpeg': { label: 'JPEG', extensions: ['jpg', 'jpeg'] },
  'image/png': { label: 'PNG', extensions: ['png'] },
  'image/gif': { label: 'GIF', extensions: ['gif'] },
  'image/webp': { label: 'WebP', extensions: ['webp'] },
};

/** UX classification only; the backend independently checks stored bytes before activation. */
export function detectImageFormat(bytes: Uint8Array): ImageMime | null {
  const has = (offset: number, signature: readonly number[]) => bytes.length >= offset + signature.length && signature.every((value, i) => bytes[offset + i] === value);
  const ascii = (offset: number, text: string) => has(offset, [...text].map(char => char.charCodeAt(0)));
  if (has(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (has(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return 'image/gif';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP') && ['VP8 ', 'VP8L', 'VP8X'].some(chunk => ascii(12, chunk))) return 'image/webp';
  return null;
}

export function imageFileName(originalName: string, mime: ImageMime): string {
  const name = originalName.trim().normalize('NFC');
  const dot = name.lastIndexOf('.');
  if (dot > 0 && formats[mime].extensions.includes(name.slice(dot + 1).toLowerCase())) return name;
  const suffix = '.' + formats[mime].extensions[0];
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return [...stem].slice(0, 255 - suffix.length).join('') + suffix;
}

export async function prepareImage(file: File): Promise<{ file: File; notice: string }> {
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await file.slice(0, IMAGE_HEADER_BYTES).arrayBuffer()); }
  catch { throw new UploadRequestError('FILE_READ_FAILED'); }
  const mime = detectImageFormat(bytes);
  if (!mime) throw new UploadRequestError('UNSUPPORTED_MEDIA_TYPE');
  const name = imageFileName(file.name, mime);
  // New File metadata, unchanged bytes; never overwrite or convert the user's local file.
  const prepared = new File([file], name, { type: mime, lastModified: file.lastModified });
  const notice = name !== file.name.trim().normalize('NFC') || mime !== file.type
    ? `A felismert formátum ${formats[mime].label}. Feltöltési név: ${name}. A képtartalom nem változik.` : '';
  return { file: prepared, notice };
}

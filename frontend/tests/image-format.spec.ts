import { describe, expect, it, vi } from 'vitest';
import { detectImageFormat, imageFileName, prepareImage, type ImageMime } from '../src/upload/image-format';

const ascii = (text: string) => new TextEncoder().encode(text);
const signatures: [ImageMime, Uint8Array<ArrayBuffer>][] = [
  ['image/jpeg', new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70])],
  ['image/png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
  ['image/gif', ascii('GIF87a')], ['image/gif', ascii('GIF89a')],
  ['image/webp', ascii('RIFF0000WEBPVP8 ')], ['image/webp', ascii('RIFF0000WEBPVP8L')], ['image/webp', ascii('RIFF0000WEBPVP8X')],
];
describe('bounded image format recognition', () => {
  it.each(signatures)('recognizes %s by bytes', (mime, bytes) => {
    expect(detectImageFormat(bytes)).toBe(mime);
  });
  it.each([new Uint8Array(), new Uint8Array([255, 216]), new Uint8Array([137, 80, 78, 71]), ascii('GIF89'),
    ascii('RIFF0000WEBP'), ascii('RIFF0000WEBPBAD!'), ascii('<svg>'), ascii('<html>'), ascii('<?xml'), ascii('arbitrary bytes')])('rejects unknown or incomplete signature', bytes => {
    expect(detectImageFormat(bytes)).toBeNull();
  });
  it('repairs PNG-named JPEG without changing bytes, size, lastModified or the original File', async () => {
    const bytes = signatures[0][1]; const original = new File([bytes], 'cashback.png', { type: 'image/png', lastModified: 123 });
    const prepared = await prepareImage(original);
    expect(prepared.file.name).toBe('cashback.jpg'); expect(prepared.file.type).toBe('image/jpeg');
    expect(prepared.file.size).toBe(original.size); expect(prepared.file.lastModified).toBe(123);
    expect(new Uint8Array(await prepared.file.arrayBuffer())).toEqual(bytes);
    expect(original.name).toBe('cashback.png'); expect(original.type).toBe('image/png');
    expect(prepared.notice).toContain('JPEG'); expect(prepared.notice).toContain('cashback.jpg');
  });
  it.each(['', 'text/plain', 'image/jpeg', 'application/octet-stream'])('accepts valid PNG despite browser type %s', async type => {
    const prepared = await prepareImage(new File([signatures[1][1]], 'picture.txt', { type }));
    expect(prepared.file.type).toBe('image/png'); expect(prepared.file.name).toBe('picture.png');
  });
  it.each(signatures)('reads only the first 16 bytes for %s, never the full source', async (_mime, bytes) => {
    const original = new File([bytes, new Uint8Array(1024)], 'picture.png');
    const slice = vi.spyOn(original, 'slice'); const whole = vi.spyOn(original, 'arrayBuffer');
    await prepareImage(original); expect(slice).toHaveBeenCalledExactlyOnceWith(0, 16); expect(whole).not.toHaveBeenCalled();
  });
  it('rejects forged PNG type and reports a safe local read error', async () => {
    await expect(prepareImage(new File(['<svg/>'], 'forged.png', { type: 'image/png' }))).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE', retryable: false });
    const original = new File(['unreadable'], 'x.png'); vi.spyOn(original, 'slice').mockImplementation(() => { throw new Error('private path'); });
    const error = await prepareImage(original).catch(e => e);
    expect(error.code).toBe('FILE_READ_FAILED'); expect(error.message).not.toContain('private'); expect(error.retryable).toBe(false);
  });
  it('does not warn on a matching image', async () => {
    const prepared = await prepareImage(new File([signatures[1][1]], 'image.png', { type: 'image/png' }));
    expect(prepared.notice).toBe('');
  });
});
describe('type-consistent upload/download metadata name', () => {
  it.each([
    ['photo.png', 'image/jpeg', 'photo.jpg'], ['photo.JPG', 'image/jpeg', 'photo.JPG'],
    ['photo.JPEG', 'image/jpeg', 'photo.JPEG'], ['photo', 'image/png', 'photo.png'],
    ['photo.', 'image/gif', 'photo.gif'], ['archive.photo.svg', 'image/webp', 'archive.photo.webp'],
    ['.hidden', 'image/png', '.hidden.png'], ['  ke\u0301p.PNG  ', 'image/png', 'kép.PNG'],
  ] as const)('normalizes %s for %s', (name, mime, expected) => {
    expect(imageFileName(name, mime)).toBe(expected);
  });
  it('bounds extension repair to 255 codepoints without splitting supplementary characters', () => {
    const name = '😀'.repeat(255); const output = imageFileName(name, 'image/webp');
    expect([...output]).toHaveLength(255); expect(output.endsWith('.webp')).toBe(true); expect(/[\ud800-\udfff]/u.test(output)).toBe(false);
  });
});

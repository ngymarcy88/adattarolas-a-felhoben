import sharp from 'sharp';
import { assertWebpOutput } from '../src/processing/webp-output';
import { ProcessorError } from '../src/processing/processor-error';

function chunk(type: string, bytes: Buffer) {
  const header = Buffer.alloc(8); header.write(type, 'ascii'); header.writeUInt32LE(bytes.length, 4);
  return Buffer.concat([header, bytes, ...(bytes.length & 1 ? [Buffer.from([0])] : [])]);
}
function riff(...chunks: Buffer[]) {
  const body = Buffer.concat([Buffer.from('WEBP'), ...chunks]); const header = Buffer.alloc(8);
  header.write('RIFF'); header.writeUInt32LE(body.length, 4); return Buffer.concat([header, body]);
}
function vp8(width = 2, height = 3) {
  const bytes = Buffer.alloc(10); bytes[0] = 0x10; bytes.set([0x9d, 1, 0x2a], 3);
  bytes.writeUInt16LE(width, 6); bytes.writeUInt16LE(height, 8); return chunk('VP8 ', bytes);
}
function lossless(width = 2, height = 3) {
  const bytes = Buffer.alloc(5); bytes[0] = 0x2f; bytes.writeUInt32LE((width - 1) | ((height - 1) << 14), 1);
  return chunk('VP8L', bytes);
}
function extended(flags = 0, width = 2, height = 3) {
  const bytes = Buffer.alloc(10); bytes[0] = flags; bytes.writeUIntLE(width - 1, 4, 3); bytes.writeUIntLE(height - 1, 7, 3);
  return chunk('VP8X', bytes);
}
const rejects = (bytes: Uint8Array, width = 2, height = 3) => {
  expect(() => assertWebpOutput(bytes, width, height)).toThrow(ProcessorError);
  try { assertWebpOutput(bytes, width, height); } catch (error) {
    expect(error).toMatchObject({ code: 'PROCESSOR_INTERNAL_ERROR', message: 'Image processing failed.' });
  }
};
describe('bounded static WebP output policy', () => {
  it.each([riff(vp8()), riff(lossless()), riff(extended(), vp8()), riff(extended(), lossless()),
    riff(extended(0x10), chunk('ALPH', Buffer.alloc(7)), vp8())])('accepts matching synthetic headers %# without claiming pixel decoding', bytes => {
    expect(() => assertWebpOutput(bytes, 2, 3)).not.toThrow();
  });
  it.each(['ICCP', 'EXIF', 'XMP ', 'ANIM', 'ANMF', 'JUNK'])('rejects forbidden %s even after a valid image', type => rejects(riff(vp8(), chunk(type, Buffer.from([1])))));
  it.each([riff(), Buffer.from('not WebP'), riff(vp8(), vp8()), riff(lossless(), vp8()), riff(extended(), extended(), vp8()),
    riff(vp8(), extended()), riff(chunk('ALPH', Buffer.alloc(7)), vp8()), riff(extended(0x10), vp8()),
    riff(extended(0x10), chunk('ALPH', Buffer.alloc(7)), lossless()),
    riff(extended(0x10), chunk('ALPH', Buffer.alloc(7)), chunk('ALPH', Buffer.alloc(7)), vp8()),
    riff(extended(0x10), chunk('ALPH', Buffer.from([2, 0])), vp8()),
    riff(extended(0x10), chunk('ALPH', Buffer.from([0, 0])), vp8()),
  ])('rejects empty, duplicated or misordered structure %#', bytes => rejects(bytes));
  it.each([1, 2, 4, 8, 32, 64, 128])('rejects metadata/animation/reserved VP8X flag %i', flags => rejects(riff(extended(flags), vp8())));
  it('checks padding, bounded chunk sizes, trailing data and complete RIFF length', () => {
    const odd = riff(lossless()); odd[odd.length - 1] = 1; rejects(odd);
    const oversized = riff(vp8()); oversized.writeUInt32LE(0xffffffff, 16); rejects(oversized);
    rejects(riff(vp8()).subarray(0, 29)); rejects(Buffer.concat([riff(vp8()), Buffer.from([0])]));
    const extra = Buffer.concat([riff(vp8()), Buffer.from([0])]); extra.writeUInt32LE(extra.length - 8, 4); rejects(extra);
    rejects(Buffer.alloc(524289));
  });
  it('accepts the exact byte ceiling and views with a nonzero byte offset', () => {
    const payload = Buffer.alloc(524288 - 20); vp8().copy(payload, 0, 8);
    const bytes = riff(chunk('VP8 ', payload));
    expect(bytes.length).toBe(524288);
    expect(() => assertWebpOutput(bytes, 2, 3)).not.toThrow();
    const wrapped = Buffer.concat([Buffer.from('prefix'), riff(vp8()), Buffer.from('suffix')]);
    expect(() => assertWebpOutput(wrapped.subarray(6, wrapped.length - 6), 2, 3)).not.toThrow();
  });
  it.each([0x40, 0x80, 0x20, 0x03])('rejects reserved/unsupported ALPH flags %i', flags => {
    rejects(riff(extended(0x10), chunk('ALPH', Buffer.from([flags, 0])), vp8()));
  });
  it.each([[0, 3], [513, 3], [2, 0], [2, 513], [2.5, 3], [NaN, 3]])('rejects invalid expected dimensions %#', (width, height) => rejects(riff(vp8()), width, height));
  it('checks encoded geometry, keyframe start, reserved extended bytes and lossless version', () => {
    rejects(riff(vp8(3, 3))); rejects(riff(lossless(2, 4))); rejects(riff(extended(0, 4, 3), vp8()));
    const keyframe = vp8(); keyframe[8] = 0x11; rejects(riff(keyframe));
    const start = vp8(); start[11] = 0; rejects(riff(start));
    const reserved = extended(); reserved[9] = 1; rejects(riff(reserved, vp8()));
    const version = lossless(); version[12] = 0x20; rejects(riff(version));
  });
  it.each([3, 4])('accepts actual Sharp lossy WebP with %i input channels', async channels => {
    const bytes = await sharp({ create: { width: 17, height: 11, channels: channels as 3 | 4,
      background: { r: 31, g: 80, b: 140, alpha: 0.4 } } }).webp({ quality: 80, alphaQuality: 100, effort: 4 }).toBuffer();
    expect(() => assertWebpOutput(bytes, 17, 11)).not.toThrow();
  });
  it.each([3, 4])('accepts actual Sharp lossless WebP with %i input channels', async channels => {
    const bytes = await sharp({ create: { width: 17, height: 11, channels: channels as 3 | 4,
      background: { r: 31, g: 80, b: 140, alpha: 0.4 } } }).webp({ lossless: true }).toBuffer();
    expect(() => assertWebpOutput(bytes, 17, 11)).not.toThrow();
  });
  it('rejects a real non-WebP image', async () => {
    const png = await sharp({ create: { width: 2, height: 3, channels: 3, background: 'red' } }).png().toBuffer(); rejects(png);
  });
});

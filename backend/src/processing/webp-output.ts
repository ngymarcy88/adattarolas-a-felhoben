import { ProcessorError } from './processor-error';

const MAX_BYTES = 524288;
const invalid = (): never => { throw new ProcessorError('PROCESSOR_INTERNAL_ERROR'); };

/** Narrow static output-policy check, not a compressed pixel decoder.
 * https://developers.google.com/speed/webp/docs/riff_container
 * https://developers.google.com/speed/webp/docs/webp_lossless_bitstream_specification
 */
export function assertWebpOutput(bytes: Uint8Array, width: number, height: number): void {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 20 || bytes.byteLength > MAX_BYTES ||
        !Number.isSafeInteger(width) || width < 1 || width > 512 ||
        !Number.isSafeInteger(height) || height < 1 || height > 512) invalid();
    const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const fourCC = (at: number, value: string) => {
      for (let i = 0; i < 4; i++) if (data[at + i] !== value.charCodeAt(i)) return false;
      return true;
    };
    if (!fourCC(0, 'RIFF') || !fourCC(8, 'WEBP') || data.readUInt32LE(4) + 8 !== data.length) invalid();
    let extended = false; let alpha = false; let image = false; let alphaFlag = false;
    let offset = 12;
    while (offset < data.length) {
      if (data.length - offset < 8) invalid();
      const size = data.readUInt32LE(offset + 4);
      const start = offset + 8; const end = start + size;
      if (end > data.length || end + (size & 1) > data.length || ((size & 1) && data[end] !== 0)) invalid();
      if (fourCC(offset, 'VP8X')) {
        if (offset !== 12 || extended || size !== 10) invalid();
        // Only the alpha feature is permitted: no metadata, animation or reserved bits.
        if ((data[start]! & ~0x10) !== 0 || data.readUIntBE(start + 1, 3) !== 0 ||
            data.readUIntLE(start + 4, 3) + 1 !== width || data.readUIntLE(start + 7, 3) + 1 !== height) invalid();
        extended = true; alphaFlag = (data[start]! & 0x10) !== 0;
      } else if (fourCC(offset, 'ALPH')) {
        if (!extended || !alphaFlag || alpha || image || size < 2) invalid();
        const flags = data[start]!;
        if ((flags & 0xc0) !== 0 || (flags & 3) > 1 || ((flags >>> 4) & 3) > 1 ||
            ((flags & 3) === 0 && size !== 1 + width * height)) invalid();
        alpha = true;
      } else if (fourCC(offset, 'VP8 ')) {
        if (image || size < 10 || (extended && alphaFlag !== alpha)) invalid();
        const tag = data.readUIntLE(start, 3);
        if ((tag & 1) !== 0 || ((tag >>> 1) & 7) > 3 || (tag & 0x10) === 0 ||
            data[start + 3] !== 0x9d || data[start + 4] !== 0x01 || data[start + 5] !== 0x2a ||
            (data.readUInt16LE(start + 6) & 0x3fff) !== width ||
            (data.readUInt16LE(start + 8) & 0x3fff) !== height) invalid();
        image = true;
      } else if (fourCC(offset, 'VP8L')) {
        if (image || alpha || size < 5 || data[start] !== 0x2f) invalid();
        const bits = data.readUInt32LE(start + 1);
        if ((bits >>> 29) !== 0 || (bits & 0x3fff) + 1 !== width || ((bits >>> 14) & 0x3fff) + 1 !== height) invalid();
        image = true;
      } else invalid();
      offset = end + (size & 1);
    }
    if (!image || offset !== data.length) invalid();
  } catch { invalid(); }
}

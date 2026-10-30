import sharp from 'sharp';
import { crc32, deflateSync } from 'node:zlib';

export type RasterFormat = 'jpeg' | 'png' | 'webp' | 'gif';

/** Synthetic bytes only; no network, personal images or committed binary fixtures. */
export async function solidImage(format: RasterFormat, width = 32, height = 16): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 220, g: 30, b: 10, alpha: 0.5 } } })
    .toFormat(format).toBuffer();
}

export async function animatedImage(format: 'gif' | 'webp'): Promise<Buffer> {
  const width = 8;
  const height = 6;
  const frame = Buffer.alloc(width * height * 4);
  for (let index = 0; index < frame.length; index += 4) {
    frame[index] = 255;
    frame[index + 3] = 255;
  }
  const second = Buffer.from(frame);
  for (let index = 0; index < second.length; index += 4) {
    second[index] = 0;
    second[index + 2] = 255;
  }
  return sharp(Buffer.concat([frame, second]), { raw: { width, height: height * 2, channels: 4, pageHeight: height } })
    .toFormat(format, { loop: 0, delay: [100, 100] }).toBuffer();
}

function chunk(type: string, bytes: Buffer): Buffer {
  const name = Buffer.from(type, 'ascii');
  const size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, bytes])));
  return Buffer.concat([size, name, bytes, checksum]);
}

function pngHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return chunk('IHDR', header);
}

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function oversizedPngHeader(width: number, height: number): Buffer {
  // A CRC-correct bounded header. No large raster is allocated or decoded.
  return Buffer.concat([pngSignature, pngHeader(width, height), chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255]))), chunk('IEND', Buffer.alloc(0))]);
}

export function animatedPng(separateDefault = false): Buffer {
  const control = Buffer.alloc(8);
  control.writeUInt32BE(separateDefault ? 1 : 2, 0);
  const frameControl = (sequence: number): Buffer => {
    const bytes = Buffer.alloc(26);
    bytes.writeUInt32BE(sequence, 0);
    bytes.writeUInt32BE(2, 4);
    bytes.writeUInt32BE(2, 8);
    bytes.writeUInt16BE(1, 20);
    bytes.writeUInt16BE(10, 22);
    return chunk('fcTL', bytes);
  };
  const frame = (red: number, blue: number) => deflateSync(Buffer.from([
    0, red, 0, blue, 255, red, 0, blue, 255,
    0, red, 0, blue, 255, red, 0, blue, 255,
  ]));
  const sequence = Buffer.alloc(4);
  sequence.writeUInt32BE(separateDefault ? 1 : 2);
  if (separateDefault) {
    return Buffer.concat([
      pngSignature, pngHeader(2, 2), chunk('acTL', control), chunk('IDAT', frame(255, 0)),
      frameControl(0), chunk('fdAT', Buffer.concat([sequence, frame(0, 255)])), chunk('IEND', Buffer.alloc(0)),
    ]);
  }
  return Buffer.concat([
    pngSignature, pngHeader(2, 2), chunk('acTL', control), frameControl(0),
    chunk('IDAT', frame(255, 0)), frameControl(1),
    chunk('fdAT', Buffer.concat([sequence, frame(0, 255)])), chunk('IEND', Buffer.alloc(0)),
  ]);
}

export async function orientedImage(orientation: 2 | 6): Promise<Buffer> {
  // Three unequal colour regions reveal mirroring as well as rotation.
  const pixels = Buffer.from([
    255, 0, 0, 255, 0, 0, 0, 0, 255,
    0, 255, 0, 255, 255, 0, 255, 255, 0,
  ]);
  return sharp(pixels, { raw: { width: 3, height: 2, channels: 3 } })
    .png().withMetadata({ orientation }).toBuffer();
}

export async function metadataImage(): Promise<Buffer> {
  return sharp({ create: { width: 24, height: 12, channels: 3, background: '#dd4422' } })
    .jpeg()
    .withExif({ IFD0: { Artist: 'Synthetic fixture' }, IFD2: { DateTimeOriginal: '2026:01:01 12:00:00' } })
    .withIccProfile('srgb')
    .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" /></rdf:RDF></x:xmpmeta>')
    .toBuffer();
}

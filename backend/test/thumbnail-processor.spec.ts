import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { ThumbnailProcessor } from '../src/processing/thumbnail-processor';
import { animatedImage, animatedPng, metadataImage, orientedImage, oversizedPngHeader, solidImage } from './helpers/thumbnail-fixture';

jest.setTimeout(30000);

const processor = new ThumbnailProcessor();
const fingerprint = /^[a-f0-9]{64}$/;
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const errorCode = (code: string) => expect.objectContaining({ name: 'ProcessorError', code });

async function decodedPixels(input: Uint8Array): Promise<Buffer> {
  return sharp(Buffer.from(input)).removeAlpha().raw().toBuffer();
}

function expectNearPixels(actual: Buffer, expected: Buffer, tolerance = 30): void {
  expect(actual.length).toBe(expected.length);
  for (let index = 0; index < actual.length; index++) {
    expect(Math.abs(actual[index]! - expected[index]!)).toBeLessThanOrEqual(tolerance);
  }
}

describe('ThumbnailProcessor isolated raster processing', () => {
  it('declares a stable version, output kind and implementation fingerprint', () => {
    expect(processor.key).toBe('thumbnail');
    expect(processor.version).toBe('1.0.0');
    expect(processor.outputKind).toBe('thumbnail');
    expect(processor.supportedMimeTypes).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    expect(processor.implementationFingerprint).toMatch(fingerprint);
    expect(new ThumbnailProcessor().implementationFingerprint).toBe(processor.implementationFingerprint);
  });

  it('keeps processor identity, limits and the MIME allowlist immutable at runtime', () => {
    const instance = new ThumbnailProcessor();
    for (const key of ['key', 'version', 'outputKind', 'implementationFingerprint'] as const) {
      expect(() => { (instance as unknown as Record<string, unknown>)[key] = 'mutated'; }).toThrow();
    }
    expect(Object.isFrozen(instance.limits)).toBe(true);
    expect(Object.isFrozen(instance.supportedMimeTypes)).toBe(true);
  });

  it.each(['jpeg', 'png', 'webp', 'gif'] as const)('produces an independently decodable bounded WebP from %s', async (format) => {
    const input = await solidImage(format);
    const before = Buffer.from(input);
    const result = await processor.process(input, `image/${format}`);
    expect(result.kind).toBe('artifact');
    expect(result.mimeType).toBe('image/webp');
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.sizeBytes).toBe(result.bytes.byteLength);
    expect(result.sizeBytes).toBeLessThanOrEqual(512 * 1024);
    expect(result.sha256).toBe(digest(result.bytes));
    expect(result.implementationFingerprint).toBe(processor.implementationFingerprint);
    expect(result.selectedFrame).toBe(0);
    const metadata = await sharp(Buffer.from(result.bytes)).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(32);
    expect(metadata.height).toBe(16);
    expect(result.width).toBe(metadata.width);
    expect(result.height).toBe(metadata.height);
    expect(metadata.pages ?? 1).toBe(1);
    expect(input).toEqual(before);
  });

  it('fits a large landscape within 512 pixels without changing its aspect ratio', async () => {
    const result = await processor.process(await solidImage('png', 1200, 600), 'image/png');
    const actual = await sharp(Buffer.from(result.bytes)).metadata();
    expect([actual.width, actual.height]).toEqual([512, 256]);
    expect([result.width, result.height]).toEqual([512, 256]);
  });

  it('fits a portrait within the same 512-pixel bounding box', async () => {
    const result = await processor.process(await solidImage('png', 600, 1200), 'image/png');
    expect([result.width, result.height]).toEqual([256, 512]);
  });

  it('preserves transparency', async () => {
    const result = await processor.process(await solidImage('png'), 'image/png');
    const metadata = await sharp(Buffer.from(result.bytes)).metadata();
    expect(metadata.hasAlpha).toBe(true);
    const { data, info } = await sharp(Buffer.from(result.bytes)).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    expect(data[3]).toBeGreaterThan(100);
    expect(data[3]).toBeLessThan(150);
  });

  it.each([2, 6] as const)('applies EXIF orientation %s and removes the orientation tag', async (orientation) => {
    const input = await orientedImage(orientation);
    expect((await sharp(input).metadata()).orientation).toBe(orientation);
    const result = await processor.process(input, 'image/png');
    const expected = await sharp(input).autoOrient().webp({ quality: 80, alphaQuality: 100, effort: 4 }).toBuffer();
    const actualMeta = await sharp(Buffer.from(result.bytes)).metadata();
    expect([actualMeta.width, actualMeta.height]).toEqual(orientation === 6 ? [2, 3] : [3, 2]);
    expect(actualMeta.orientation).toBeUndefined();
    expectNearPixels(await decodedPixels(result.bytes), await decodedPixels(expected));
  });

  it('strips EXIF, ICC and XMP metadata', async () => {
    const input = await metadataImage();
    const source = await sharp(input).metadata();
    expect(source.exif?.length).toBeGreaterThan(0);
    expect(source.icc?.length).toBeGreaterThan(0);
    expect(source.xmp?.length).toBeGreaterThan(0);
    const result = await processor.process(input, 'image/jpeg');
    const output = await sharp(Buffer.from(result.bytes)).metadata();
    expect(output.exif).toBeUndefined();
    expect(output.icc).toBeUndefined();
    expect(output.xmp).toBeUndefined();
    expect(output.orientation).toBeUndefined();
  });

  it.each(['gif', 'webp', 'apng'] as const)('chooses only frame zero from animated %s', async (format) => {
    const input = format === 'apng' ? animatedPng() : await animatedImage(format);
    // GIF/WebP loaders expose frames. APNG intentionally uses the default PNG frame.
    if (format !== 'apng') expect((await sharp(input, { animated: true }).metadata()).pages).toBe(2);
    const result = await processor.process(input, format === 'apng' ? 'image/png' : `image/${format}`);
    const metadata = await sharp(Buffer.from(result.bytes)).metadata();
    expect(metadata.pages ?? 1).toBe(1);
    expect(result.selectedFrame).toBe(0);
    expect([metadata.width, metadata.height]).toEqual(format === 'apng' ? [2, 2] : [8, 6]);
    const pixels = await decodedPixels(result.bytes);
    for (let index = 0; index < pixels.length; index += 3) {
      expect(pixels[index]).toBeGreaterThan(200);
      expect(pixels[index + 2]).toBeLessThan(40);
    }
  });

  it('returns identical bytes and hash on repeat processing within the same runtime', async () => {
    const input = await solidImage('png');
    const first = await processor.process(input, 'image/png');
    const second = await processor.process(input, 'image/png');
    expect(second.bytes).toEqual(first.bytes);
    expect(second.sha256).toBe(first.sha256);
    expect(second.implementationFingerprint).toBe(first.implementationFingerprint);
  });

  it('processes only the supplied byte view, excluding backing-buffer prefix and suffix', async () => {
    const image = await solidImage('png');
    const backing = new Uint8Array(image.length + 32);
    backing.fill(0xa5);
    backing.set(image, 16);
    const before = Uint8Array.from(backing);
    const result = await processor.process(backing.subarray(16, 16 + image.length), 'image/png');
    expect((await sharp(Buffer.from(result.bytes)).metadata()).format).toBe('webp');
    expect(backing).toEqual(before);
  });

  it('snapshots caller-owned input before asynchronous processing', async () => {
    const original = await solidImage('png');
    const source = Uint8Array.from(original);
    const pending = processor.process(source, 'image/png');
    source.fill(0);
    const result = await pending;
    expect((await sharp(Buffer.from(result.bytes)).metadata()).format).toBe('webp');
    expect(source.every((byte) => byte === 0)).toBe(true);
  });
});

describe('ThumbnailProcessor rejection boundaries', () => {
  it.each(['image/svg+xml', 'image/tiff', 'text/plain', 'video/mp4', '', 'IMAGE/PNG'])('rejects unsupported declared MIME %s', async (mime) => {
    await expect(processor.process(await solidImage('png'), mime)).rejects.toEqual(errorCode('PROCESSOR_INPUT_UNSUPPORTED'));
  });

  it('rejects supported magic with a mismatching declared MIME', async () => {
    await expect(processor.process(await solidImage('png'), 'image/jpeg')).rejects.toEqual(errorCode('PROCESSOR_INPUT_INVALID'));
  });

  it.each([
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'),
    Buffer.from('plain text'),
    Buffer.from([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]),
  ])('rejects unsupported actual content behind a PNG declaration', async (input) => {
    await expect(processor.process(input, 'image/png')).rejects.toEqual(errorCode('PROCESSOR_INPUT_UNSUPPORTED'));
  });

  it.each([Buffer.alloc(0), null, undefined, 'https://example.test/image.png', '/tmp/private-file.png', { length: 20 }, new ArrayBuffer(16)])('rejects empty or non-byte input without reading a path or URL', async (input) => {
    await expect(processor.process(input as Uint8Array, 'image/png')).rejects.toEqual(errorCode('PROCESSOR_INPUT_INVALID'));
  });

  it('rejects input exceeding 32 MiB before decoding', async () => {
    await expect(processor.process(Buffer.alloc(32 * 1024 * 1024 + 1), 'image/png')).rejects.toEqual(errorCode('PROCESSOR_INPUT_LIMIT'));
  });

  it.each([[20001, 1], [10000, 5000]])('rejects a bounded PNG header claiming %s×%s pixels', async (width, height) => {
    await expect(processor.process(oversizedPngHeader(width, height), 'image/png')).rejects.toEqual(errorCode('PROCESSOR_INPUT_LIMIT'));
  });

  it('rejects APNG whose default poster differs from animation frame zero', async () => {
    await expect(processor.process(animatedPng(true), 'image/png')).rejects.toEqual(errorCode('PROCESSOR_INPUT_UNSUPPORTED'));
  });

  it('rejects a truncated image with recognizable magic', async () => {
    const input = await solidImage('png', 64, 64);
    await expect(processor.process(input.subarray(0, 40), 'image/png')).rejects.toEqual(errorCode('PROCESSOR_INPUT_INVALID'));
  });

  it('rejects corrupted payload after an otherwise recognizable PNG header', async () => {
    const input = await solidImage('png', 64, 64);
    const corrupt = Buffer.from(input);
    corrupt.fill(0xff, 45, Math.min(corrupt.length - 12, 60));
    await expect(processor.process(corrupt, 'image/png')).rejects.toEqual(errorCode('PROCESSOR_INPUT_INVALID'));
  });

  it('honours a pre-aborted signal without processing the image', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(processor.process(await solidImage('png'), 'image/png', controller.signal)).rejects.toEqual(errorCode('PROCESSOR_ABORTED'));
  });
});

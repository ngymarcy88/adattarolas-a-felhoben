'use strict';

// Stateless decoder subprocess. No storage, network, database or caller-selected paths.
const { createHash } = require('node:crypto');
const { crc32 } = require('node:zlib');

const codes = new Set([
  'PROCESSOR_INPUT_UNSUPPORTED', 'PROCESSOR_INPUT_INVALID', 'PROCESSOR_INPUT_LIMIT',
  'PROCESSOR_OUTPUT_LIMIT', 'PROCESSOR_TIMEOUT', 'PROCESSOR_RESOURCE_LIMIT', 'PROCESSOR_INTERNAL_ERROR',
]);
class ProcessorFailure extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = (code) => { throw new ProcessorFailure(code); };
let terminal = false;
let wallTimer;
process.stdout.on('error', () => process.exit(1));

function finish(header, bytes) {
  if (terminal) return;
  terminal = true;
  const success = header.ok === true;
  const exit = () => { clearTimeout(wallTimer); process.exit(success ? 0 : 1); };
  try {
    const line = Buffer.from(`${JSON.stringify(header)}\n`, 'utf8');
    if (bytes) { process.stdout.write(line); process.stdout.write(bytes, exit); }
    else process.stdout.write(line, exit);
  } catch { process.exit(1); }
}

function safeCode(error) {
  if (error instanceof ProcessorFailure && codes.has(error.code)) return error.code;
  // Provider text is only classified locally, never returned or logged.
  const message = error instanceof Error ? error.message : '';
  if (/timeout|timed out/i.test(message)) return 'PROCESSOR_TIMEOUT';
  if (/pixel limit|channel limit|exceeds.*(?:pixel|channel)|image dimensions.*(?:exceed|limit)/i.test(message)) {
    return 'PROCESSOR_INPUT_LIMIT';
  }
  if (error instanceof RangeError || /out of memory|unable to allocate|allocation failed|memory limit/i.test(message)) {
    return 'PROCESSOR_RESOURCE_LIMIT';
  }
  return 'PROCESSOR_INPUT_INVALID';
}

async function readInput(policy) {
  const header = Buffer.alloc(policy.maxHeaderBytes);
  let headerLength = 0;
  let metadata;
  let bytes;
  let offset = 0;
  for await (const chunk of process.stdin) {
    if (!(chunk instanceof Uint8Array)) fail('PROCESSOR_INPUT_INVALID');
    let start = 0;
    if (!metadata) {
      const newline = chunk.indexOf(10);
      const count = newline < 0 ? chunk.byteLength : newline;
      if (count > header.byteLength - headerLength) fail('PROCESSOR_INPUT_LIMIT');
      header.set(chunk.subarray(0, count), headerLength); headerLength += count;
      if (newline < 0) continue;
      const line = header.subarray(0, headerLength);
      const text = line.toString('utf8');
      if (!Buffer.from(text, 'utf8').equals(line)) fail('PROCESSOR_INPUT_INVALID');
      try { metadata = JSON.parse(text); } catch { fail('PROCESSOR_INPUT_INVALID'); }
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
          Object.keys(metadata).some((key) => !['mimeType', 'sizeBytes'].includes(key)) ||
          typeof metadata.mimeType !== 'string' || !Number.isSafeInteger(metadata.sizeBytes) || metadata.sizeBytes < 1) {
        fail('PROCESSOR_INPUT_INVALID');
      }
      if (!policy.supportedMimeTypes.includes(metadata.mimeType)) fail('PROCESSOR_INPUT_UNSUPPORTED');
      if (metadata.sizeBytes > policy.maxInputBytes) fail('PROCESSOR_INPUT_LIMIT');
      bytes = Buffer.allocUnsafe(metadata.sizeBytes);
      start = newline + 1;
    }
    const content = chunk.subarray(start);
    if (content.byteLength > bytes.byteLength - offset) fail('PROCESSOR_INPUT_INVALID');
    bytes.set(content, offset); offset += content.byteLength;
  }
  if (!metadata || offset !== bytes.byteLength) fail('PROCESSOR_INPUT_INVALID');
  return { metadata, bytes };
}

function headerFormat(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'gif';
  fail('PROCESSOR_INPUT_UNSUPPORTED');
}

// The PNG loader decodes the default raster. For APNG that can differ from animation frame 0.
// Reject that unsupported layout rather than mislabelling the fallback raster as selectedFrame 0.
function validatePngFrameLayout(bytes) {
  let offset = 8; let firstData = false; let firstControl = false;
  let declaredFrames = 0; let controls = 0; let nextSequence = 0;
  let width = 0; let height = 0;
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) fail('PROCESSOR_INPUT_INVALID');
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) fail('PROCESSOR_INPUT_INVALID');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type) ||
        crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== bytes.readUInt32BE(offset + 8 + length)) {
      fail('PROCESSOR_INPUT_INVALID');
    }
    const data = offset + 8;
    if (offset === 8) {
      if (type !== 'IHDR' || length !== 13) fail('PROCESSOR_INPUT_INVALID');
      width = bytes.readUInt32BE(data); height = bytes.readUInt32BE(data + 4);
      if (!width || !height) fail('PROCESSOR_INPUT_INVALID');
    } else if (type === 'IHDR') fail('PROCESSOR_INPUT_INVALID');
    if (type === 'acTL') {
      if (length !== 8 || firstData || declaredFrames) fail('PROCESSOR_INPUT_INVALID');
      declaredFrames = bytes.readUInt32BE(data);
      if (!declaredFrames) fail('PROCESSOR_INPUT_INVALID');
    }
    if (type === 'fcTL') {
      if (!declaredFrames || length !== 26 || bytes.readUInt32BE(data) !== nextSequence++) fail('PROCESSOR_INPUT_INVALID');
      const frameWidth = bytes.readUInt32BE(data + 4); const frameHeight = bytes.readUInt32BE(data + 8);
      const x = bytes.readUInt32BE(data + 12); const y = bytes.readUInt32BE(data + 16);
      if (!frameWidth || !frameHeight || frameWidth + x > width || frameHeight + y > height ||
          bytes[data + 24] > 2 || bytes[data + 25] > 1 || ++controls > declaredFrames) fail('PROCESSOR_INPUT_INVALID');
      if (!firstData) {
        if (controls !== 1 || frameWidth !== width || frameHeight !== height || x || y) fail('PROCESSOR_INPUT_INVALID');
        firstControl = true;
      }
    }
    if (type === 'IDAT' && !firstData) {
      firstData = true;
      if (declaredFrames && !firstControl) fail('PROCESSOR_INPUT_UNSUPPORTED');
    }
    if (type === 'fdAT') {
      if (!declaredFrames || !firstData || controls < 2 || length < 4 ||
          bytes.readUInt32BE(data) !== nextSequence++) fail('PROCESSOR_INPUT_INVALID');
    }
    offset += length + 12;
    if (type === 'IEND') {
      if (length !== 0 || offset !== bytes.length || !firstData || (declaredFrames && controls !== declaredFrames)) {
        fail('PROCESSOR_INPUT_INVALID');
      }
      return;
    }
  }
  fail('PROCESSOR_INPUT_INVALID');
}

function validateDimensions(metadata, policy) {
  if (!Number.isSafeInteger(metadata.width) || metadata.width < 1 ||
      !Number.isSafeInteger(metadata.height) || metadata.height < 1 ||
      !Number.isSafeInteger(metadata.channels) || metadata.channels < 1) fail('PROCESSOR_INPUT_INVALID');
  if (metadata.width > policy.maxInputDimension || metadata.height > policy.maxInputDimension ||
      metadata.width * metadata.height > policy.maxInputPixels || metadata.channels > policy.maxInputChannels) {
    fail('PROCESSOR_INPUT_LIMIT');
  }
}

async function main() {
  let policy; let sharp;
  try {
    policy = require('./thumbnail-policy.json');
    sharp = require('sharp');
    sharp.cache(false);
    sharp.concurrency(1);
    sharp.block({ operation: ['VipsForeignLoad'] });
    sharp.unblock({ operation: ['VipsForeignLoadJpegBuffer', 'VipsForeignLoadPngBuffer',
      'VipsForeignLoadWebpBuffer', 'VipsForeignLoadNsgifBuffer', 'VipsForeignLoadGifBuffer'] });
  } catch { fail('PROCESSOR_INTERNAL_ERROR'); }
  wallTimer = setTimeout(() => {
    if (terminal) process.exit(1);
    else finish({ ok: false, code: 'PROCESSOR_TIMEOUT' });
  }, policy.wallTimeoutMs);
  const { metadata: request, bytes } = await readInput(policy);
  const format = headerFormat(bytes);
  if (`image/${format}` !== request.mimeType) fail('PROCESSOR_INPUT_INVALID');
  if (format === 'png') validatePngFrameLayout(bytes);
  const options = { failOn: 'warning', unlimited: false, limitInputPixels: policy.maxInputPixels,
    limitInputChannels: policy.maxInputChannels, pages: 1, page: 0, animated: false };
  const input = await sharp(bytes, options).timeout({ seconds: policy.decodeTimeoutSeconds }).metadata();
  if (input.format !== format) fail('PROCESSOR_INPUT_INVALID');
  validateDimensions(input, policy);
  const output = await sharp(bytes, options).timeout({ seconds: policy.decodeTimeoutSeconds })
    .autoOrient().resize({ width: policy.width, height: policy.height, fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb').webp({ quality: policy.quality, alphaQuality: policy.alphaQuality, effort: policy.effort,
      force: true }).toBuffer();
  if (output.byteLength < 1 || output.byteLength > policy.maxOutputBytes) fail('PROCESSOR_OUTPUT_LIMIT');
  const result = await sharp(output, options).timeout({ seconds: policy.decodeTimeoutSeconds }).metadata();
  if (result.format !== 'webp' || !Number.isSafeInteger(result.width) || result.width < 1 ||
      !Number.isSafeInteger(result.height) || result.height < 1 || result.width > policy.width || result.height > policy.height ||
      (result.pages !== undefined && result.pages !== 1) || (result.delay && result.delay.length > 1)) {
    fail('PROCESSOR_OUTPUT_LIMIT');
  }
  if (result.exif || result.icc || result.xmp || result.iptc || result.orientation !== undefined) {
    fail('PROCESSOR_INTERNAL_ERROR');
  }
  const versions = Object.fromEntries(Object.entries(sharp.versions).sort(([a], [b]) => a.localeCompare(b)));
  const implementationFingerprint = createHash('sha256').update(JSON.stringify({ policy, versions,
    platform: process.platform, arch: process.arch })).digest('hex');
  finish({ ok: true, mimeType: 'image/webp', sizeBytes: output.byteLength, width: result.width, height: result.height,
    sha256: createHash('sha256').update(output).digest('hex'), selectedFrame: 0, implementationFingerprint }, output);
}

void main().catch((error) => finish({ ok: false, code: safeCode(error) }));

import { Injectable, PipeTransform } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/app-config';
import { ApiError } from '../common/errors/api-error';

export class UploadInitDto {
  constructor(readonly originalName: string, readonly mimeType: string, readonly sizeBytes: number) {}
}
const images = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export function uploadKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError('VALIDATION_ERROR');
  }
  return value.toLowerCase();
}
@Injectable()
export class UploadInitValidationPipe implements PipeTransform<unknown, UploadInitDto> {
  constructor(private readonly config: ConfigService) {}
  transform(value: unknown): UploadInitDto {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).length !== 3 || !['originalName', 'mimeType', 'sizeBytes'].every((key) => Object.hasOwn(value, key))) {
      throw new ApiError('VALIDATION_ERROR');
    }
    const input = value as Record<string, unknown>;
    if (typeof input.originalName !== 'string' || typeof input.mimeType !== 'string' || typeof input.sizeBytes !== 'number' ||
        !Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1) throw new ApiError('VALIDATION_ERROR');
    const name = input.originalName.trim().normalize('NFC');
    if (!name || ['.', '..'].includes(name) || Array.from(name).length > 255 ||
        /[\x00-\x1f\x7f-\x9f/\\\u202a-\u202e\u2066-\u2069]/u.test(input.originalName) || Buffer.from(name, 'utf8').toString('utf8') !== name) {
      throw new ApiError('INVALID_FILE_NAME');
    }
    const config = this.config.getOrThrow<AppConfig>('app');
    if (!images.has(input.mimeType) || !config.allowedMimeTypes.includes(input.mimeType as AppConfig['allowedMimeTypes'][number])) {
      throw new ApiError('UNSUPPORTED_MEDIA_TYPE');
    }
    if (input.sizeBytes > Math.min(config.maxUploadBytes, 104857600)) throw new ApiError('FILE_TOO_LARGE');
    return new UploadInitDto(name, input.mimeType, input.sizeBytes);
  }
}

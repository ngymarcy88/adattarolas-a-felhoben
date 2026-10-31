import { Injectable, type PipeTransform } from '@nestjs/common';
import { ApiError } from '../common/errors/api-error';
import { FileIdPipe } from './upload-confirm.guard';

function record(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, key)) {
    throw new ApiError('VALIDATION_ERROR');
  }
  return value as Record<string, unknown>;
}
export function processingIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) throw new ApiError('VALIDATION_ERROR');
  const ids = Array.from(value, id => new FileIdPipe().transform(id));
  if (new Set(ids).size !== ids.length) throw new ApiError('VALIDATION_ERROR');
  return ids;
}
@Injectable()
export class ProcessingStatusPipe implements PipeTransform<unknown, { fileIds: string[] }> {
  transform(value: unknown): { fileIds: string[] } { return { fileIds: processingIds(record(value, 'fileIds').fileIds) }; }
}
@Injectable()
export class ProcessingRetryPipe implements PipeTransform<unknown, { expectedRetryRevision: number }> {
  transform(value: unknown): { expectedRetryRevision: number } {
    const revision = record(value, 'expectedRetryRevision').expectedRetryRevision;
    if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0 || revision > 2) throw new ApiError('VALIDATION_ERROR');
    return { expectedRetryRevision: revision };
  }
}

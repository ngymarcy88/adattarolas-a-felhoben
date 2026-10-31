export const PROCESSOR_ERROR_CODES = [
  'PROCESSOR_INPUT_UNSUPPORTED', 'PROCESSOR_INPUT_INVALID', 'PROCESSOR_INPUT_LIMIT',
  'PROCESSOR_OUTPUT_LIMIT', 'PROCESSOR_TIMEOUT', 'PROCESSOR_RESOURCE_LIMIT',
  'PROCESSOR_ABORTED', 'PROCESSOR_INTERNAL_ERROR',
] as const;
export type ProcessorErrorCode = typeof PROCESSOR_ERROR_CODES[number];
export class ProcessorError extends Error {
  constructor(readonly code: ProcessorErrorCode) {
    super('Image processing failed.'); this.name = 'ProcessorError';
  }
}

/** No persistence, SDK or job lifecycle at this boundary. A registry/orchestrator can use other result types later. */
export interface ProcessorResult {
  readonly kind: 'artifact' | 'metadata';
  readonly implementationFingerprint: string;
}
export interface ArtifactProcessorResult extends ProcessorResult {
  readonly kind: 'artifact';
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}
export interface ProcessorLimits {
  readonly maxInputBytes: number;
  readonly maxInputPixels: number;
  readonly maxInputDimension: number;
  readonly maxInputChannels: number;
  readonly maxOutputBytes: number;
  readonly wallTimeoutMs: number;
}
export interface Processor<Output extends ProcessorResult> {
  readonly key: string;
  readonly version: string;
  readonly outputKind: string;
  readonly supportedMimeTypes: readonly string[];
  readonly implementationFingerprint: string;
  readonly limits: ProcessorLimits;
  process(inputBytes: Uint8Array, detectedMimeType: string, signal?: AbortSignal): Promise<Output>;
}

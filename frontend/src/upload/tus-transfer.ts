import { DetailedError, Upload } from 'tus-js-client';
import { UploadRequestError } from '../api/uploads';
import { readRetryAfter } from '../api/retry-after';
import type { TransferDriver } from './uppy-transfer';

export const transferWithTus: TransferDriver = (file, transfer, signal, progress) => new Promise((resolve, reject) => {
  if (signal.aborted) {
    reject(new UploadRequestError('UNAVAILABLE'));
    return;
  }
  const finish = (error?: UploadRequestError) => {
    signal.removeEventListener('abort', abort);
    if (error) reject(error);
    else resolve();
  };
  const upload = new Upload(file, {
    uploadUrl: new URL('/api/v1/tus/' + transfer.id, window.location.origin).href,
    storeFingerprintForResuming: false,
    retryDelays: null,
    onProgress: bytes => { if (!signal.aborted) progress(bytes); },
    onSuccess: () => finish(),
    onError: error => {
      const response = error instanceof DetailedError ? error.originalResponse : null;
      const status = response?.getStatus();
      if (status === 401) finish(new UploadRequestError('AUTH_REQUIRED'));
      else if (status === 429) finish(new UploadRequestError('RATE_LIMITED', readRetryAfter(response?.getHeader('Retry-After') ?? null)));
      else finish(new UploadRequestError('UNAVAILABLE'));
    },
  });
  const abort = () => {
    void upload.abort(false).catch(() => {});
    finish(new UploadRequestError('UNAVAILABLE'));
  };
  signal.addEventListener('abort', abort, { once: true });
  upload.start();
});

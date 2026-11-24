export const TUS_MAX_BYTES = 5 * 1024 * 1024 - 1;
export const TUS_MAX_TRANSFERS = 32;
export const TUS_VERSION = '1.0.0';
export const TUS_STAGE_ID = /^[a-f0-9]{32}$/;
export const TUS_STAGING_DIRECTORY = '/srv/tusd-data';

export function tusAwaitingStorage(transfer: { tusDeferred: boolean; tusS3Started: boolean }): boolean {
  return transfer.tusDeferred && !transfer.tusS3Started;
}

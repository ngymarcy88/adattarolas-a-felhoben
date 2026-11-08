import { legacyUploadTerminalError } from '../src/files/upload-state.service';
import { owner, id, now, uploadFixture } from './helpers/upload-fixture';

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(now); });
afterEach(() => jest.useRealTimers());

it.each(['OPEN', 'FINALIZED', 'REJECTED', 'EXPIRED', 'CANCELLED'])('legacy cleanup skips multipart receipt %s without storage or accounting', async (state) => {
  const f = uploadFixture();
  Object.assign(f.file, { uploadTransport: 'MULTIPART', uploadUrlExpiresAt: null });
  Object.assign(f.file.uploadOperation!, { state, writesClosedAt: now, closedAt: now });
  jest.setSystemTime(new Date(+now + 86400000));
  expect(await f.cleanup.clean(owner, id)).toBe('skip');
  expect(f.storage.head).not.toHaveBeenCalled();
  expect(f.storage.deleteObject).not.toHaveBeenCalled();
  expect(f.tx.user.update).not.toHaveBeenCalled();
  expect(f.tx.uploadOperation.update).not.toHaveBeenCalled();
});

it('legacy confirm cannot activate a pending multipart file using only signature verification', async () => {
  const f = uploadFixture();
  Object.assign(f.file, { uploadTransport: 'MULTIPART', uploadUrlExpiresAt: null });
  await expect(f.confirmation.confirm(owner, id)).rejects.toMatchObject({ code: 'RESOURCE_STATE_CONFLICT' });
  expect(f.storage.head).not.toHaveBeenCalled();
  expect(f.tx.user.update).not.toHaveBeenCalled();
});

it('already ACTIVE multipart retains the existing storage-free confirm no-op', async () => {
  const f = uploadFixture();
  Object.assign(f.file, { uploadTransport: 'MULTIPART', status: 'ACTIVE', detectedMimeType: 'image/png' });
  await expect(f.confirmation.confirm(owner, id)).resolves.toMatchObject({ file: { id, status: 'ACTIVE' } });
  expect(f.storage.head).not.toHaveBeenCalled();
  expect(f.tx.user.update).not.toHaveBeenCalled();
});

it.each([null, 'UPLOAD_CANCELLED', 'TRANSFER_PARTS_INVALID'])('new/absent terminal code %s cannot leak through legacy mapping', (code) => {
  expect(() => legacyUploadTerminalError(code)).toThrow(expect.objectContaining({ code: 'DATABASE_UNAVAILABLE' }));
});

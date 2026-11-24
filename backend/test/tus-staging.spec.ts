import { multipartFixture, multipartOwner, multipartOther, image } from './helpers/multipart-fixture';
import { TusStagingService } from '../src/multipart/tus-staging.service';
import { lstat } from 'node:fs/promises';

jest.mock('node:fs/promises', () => ({ lstat: jest.fn() }));

const origin = 'http://tus.internal:8080';
const stageId = 'a'.repeat(32);
const stageHeaders = { 'Upload-Offset': String(image.length), 'Upload-Length': String(image.length) };

async function staged() {
  const f = multipartFixture(origin);
  const staging = new TusStagingService(f.store, f.service, f.config, f.storage as never);
  const transfer = await f.start();
  const fetchStage = jest.spyOn(globalThis, 'fetch');
  fetchStage.mockResolvedValueOnce(new Response(null, { status: 201, headers: { Location: origin + '/files/' + stageId } }));
  await staging.prepare(multipartOwner, transfer.transferId);
  return { ...f, ...transfer, staging, fetchStage };
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.mocked(lstat).mockReset();
});

function verifiedStage(fetchStage: jest.SpiedFunction<typeof fetch>) {
  fetchStage.mockResolvedValueOnce(new Response(null, { headers: stageHeaders }));
  fetchStage.mockResolvedValueOnce(new Response(image, { headers: { 'Content-Length': String(image.length) } }));
}

function stagingFiles(infoExists = false) {
  jest.mocked(lstat).mockImplementation(async path => {
    if (path === '/srv/tusd-data') return { isDirectory: () => true } as never;
    if (infoExists && String(path).endsWith('.info')) return {} as never;
    throw Object.assign(new Error('absent'), { code: 'ENOENT' });
  });
}

it('uses one private resource, denies foreign publication and never signs a staged part', async () => {
  const f = await staged();
  expect(f.initialized.body.item.transfer).toMatchObject({ tusStaged: true, reservationState: 'HELD' });
  await f.staging.prepare(multipartOwner, f.transferId);
  await expect(f.staging.complete(multipartOther, f.transferId)).rejects.toMatchObject({ code: 'TRANSFER_NOT_FOUND' });
  await expect(f.service.sign(multipartOwner, f.transferId, 1)).rejects.toMatchObject({ code: 'TRANSFER_STATE_CONFLICT' });
  await expect(f.service.complete(multipartOwner, f.transferId)).rejects.toMatchObject({ code: 'UPLOAD_NOT_READY' });
  await expect(f.service.resume(multipartOwner, f.transferId, { sizeBytes: image.length, contentSha256: f.input.contentSha256 }))
    .resolves.toMatchObject({ state: 'OPEN' });
  expect(f.storage.initiateMultipart).not.toHaveBeenCalled();
  expect(f.storage.listMultipartParts).not.toHaveBeenCalled();
  expect(f.fetchStage).toHaveBeenCalledTimes(1);
  expect(f.tables.user[0].reservedStorageBytes).toBe(BigInt(image.length));
});

it('rejects mismatched bytes before an S3 write and retains the reservation', async () => {
  const f = await staged();
  const incorrect = Buffer.from(image);
  incorrect[incorrect.length - 1] ^= 1;
  f.fetchStage.mockResolvedValueOnce(new Response(null, { headers: stageHeaders }));
  f.fetchStage.mockResolvedValueOnce(new Response(incorrect, { headers: { 'Content-Length': String(image.length) } }));
  await expect(f.staging.complete(multipartOwner, f.transferId)).rejects.toMatchObject({ code: 'UPLOAD_VALIDATION_FAILED' });
  expect(f.storage.initiateMultipart).not.toHaveBeenCalled();
  expect(f.storage.uploadStagedPart).not.toHaveBeenCalled();
  expect(f.tables.user[0].reservedStorageBytes).toBe(BigInt(image.length));
});

it('keeps quota reserved after a lost S3 part response and adopts the existing part on retry', async () => {
  const f = await staged();
  for (let i = 0; i < 2; i++) {
    verifiedStage(f.fetchStage);
  }
  f.storage.uploadStagedPart.mockImplementationOnce(async () => {
    f.ready(f.transferId);
    throw new Error('synthetic lost S3 acknowledgement');
  });
  await expect(f.staging.complete(multipartOwner, f.transferId)).rejects.toMatchObject({ code: 'UPLOAD_VERIFICATION_UNAVAILABLE' });
  expect(f.tables.user[0]).toMatchObject({ reservedStorageBytes: BigInt(image.length), usedStorageBytes: 100n });
  expect(f.storage.completeMultipart).not.toHaveBeenCalled();
  await f.staging.complete(multipartOwner, f.transferId);
  await f.service.confirmFile(multipartOwner, f.fileId);
  await f.service.confirmFile(multipartOwner, f.fileId);
  expect(f.storage.uploadStagedPart).toHaveBeenCalledTimes(1);
  expect(f.tables.user[0]).toMatchObject({ reservedStorageBytes: 0n, usedStorageBytes: 100n + BigInt(image.length) });
});

it('cancels before staging creation with one quota decrement and zero provider calls', async () => {
  const f = multipartFixture(origin);
  const t = await f.start();
  const requests = await Promise.all([f.service.cancel(multipartOwner, t.transferId), f.makeService().cancel(multipartOwner, t.transferId)]);
  expect(requests.at(-1)?.body.transfer).toMatchObject({ state: 'CANCELLED', reservationState: 'RELEASED' });
  expect(f.tables.user[0]).toMatchObject({ reservedStorageBytes: 0n, usedStorageBytes: 100n });
  expect(f.tables.multipartTransfer[0]).toMatchObject({ closureEvidenceType: 'tus_pre_s3_v1' });
  expect(f.storage.initiateMultipart).not.toHaveBeenCalled();
  expect(f.storage.abortMultipart).not.toHaveBeenCalled();
});

it('retries cleanup after a lost DELETE response without accepting incomplete physical absence', async () => {
  const f = await staged();
  stagingFiles();
  f.fetchStage.mockRejectedValueOnce(new Error('lost response'));
  await expect(f.service.cancel(multipartOwner, f.transferId)).resolves.toMatchObject({ body: { transfer: { cleanupState: 'PENDING', reservationState: 'HELD' } } });
  stagingFiles(true);
  for (let i = 0; i < 2; i++) f.fetchStage.mockResolvedValueOnce(new Response(null, { status: 404 }));
  await expect(f.makeService().cancel(multipartOwner, f.transferId)).resolves.toMatchObject({ body: { transfer: { cleanupState: 'PENDING', reservationState: 'HELD' } } });
  stagingFiles();
  for (let i = 0; i < 2; i++) f.fetchStage.mockResolvedValueOnce(new Response(null, { status: 404 }));
  await expect(f.makeService().cancel(multipartOwner, f.transferId)).resolves.toMatchObject({ body: { transfer: { cleanupState: 'VERIFIED', reservationState: 'RELEASED' } } });
  expect(f.tables.user[0]).toMatchObject({ reservedStorageBytes: 0n, usedStorageBytes: 100n });
  expect(f.storage.initiateMultipart).not.toHaveBeenCalled();
});

it('keeps quota when the tusd creation acknowledgement lost its resource identity', async () => {
  const f = multipartFixture(origin);
  const t = await f.start();
  const fetchStage = jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('lost response'));
  const staging = new TusStagingService(f.store, f.service, f.config, f.storage as never);
  await expect(staging.prepare(multipartOwner, t.transferId)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
  await expect(f.service.cancel(multipartOwner, t.transferId)).resolves.toMatchObject({ body: { transfer: { cleanupState: 'PENDING', reservationState: 'HELD' } } });
  expect(fetchStage).toHaveBeenCalledTimes(1);
  expect(f.storage.initiateMultipart).not.toHaveBeenCalled();
});

it('cancellation wins while complete is still reading and hashing staging', async () => {
  const f = await staged();
  stagingFiles();
  let resumeRead!: () => void;
  let reading!: () => void;
  const readingStage = new Promise<void>(resolve => { reading = resolve; });
  f.fetchStage.mockResolvedValueOnce(new Response(null, { headers: stageHeaders }));
  f.fetchStage.mockImplementationOnce(() => new Promise(resolve => {
    resumeRead = () => resolve(new Response(image, { headers: { 'Content-Length': String(image.length) } }));
    reading();
  }));
  const completed = expect(f.staging.complete(multipartOwner, f.transferId)).rejects.toMatchObject({ code: 'UPLOAD_CANCELLED' });
  await readingStage;
  f.fetchStage.mockResolvedValueOnce(new Response(null, { status: 204 }));
  f.fetchStage.mockResolvedValueOnce(new Response(null, { status: 404 }));
  await expect(f.service.cancel(multipartOwner, f.transferId)).resolves.toMatchObject({ body: { transfer: { reservationState: 'RELEASED' } } });
  resumeRead();
  await completed;
  expect(f.storage.initiateMultipart).not.toHaveBeenCalled();
});

it('keeps quota when cancellation loses the race to an S3 creation intent', async () => {
  const f = await staged();
  verifiedStage(f.fetchStage);
  let finishCreate!: () => void;
  let entered!: () => void;
  const dispatch = new Promise<void>(resolve => { entered = resolve; });
  f.storage.initiateMultipart.mockImplementationOnce(() => new Promise(resolve => {
    finishCreate = () => resolve({ uploadId: 'late-upload' });
    entered();
  }));
  const completed = expect(f.staging.complete(multipartOwner, f.transferId)).rejects.toMatchObject({ code: 'UPLOAD_CANCELLED' });
  await dispatch;
  await expect(f.service.cancel(multipartOwner, f.transferId)).resolves.toMatchObject({ body: { transfer: { cleanupState: 'CLEANUP_BLOCKED', reservationState: 'HELD' } } });
  finishCreate();
  await completed;
  expect(f.tables.multipartTransfer[0]).toMatchObject({ state: 'CANCELLED', tusS3Started: true, providerUploadId: 'late-upload' });
  expect(f.storage.uploadStagedPart).not.toHaveBeenCalled();
  expect(f.tables.user[0].reservedStorageBytes).toBe(BigInt(image.length));
});

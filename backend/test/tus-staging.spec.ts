import { multipartFixture, multipartOwner, multipartOther, image } from './helpers/multipart-fixture';
import { TusStagingService } from '../src/multipart/tus-staging.service';

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

afterEach(() => jest.restoreAllMocks());

it('uses one private resource, denies foreign publication and never signs a staged part', async () => {
  const f = await staged();
  expect(f.initialized.body.item.transfer).toMatchObject({ tusStaged: true, reservationState: 'HELD' });
  await f.staging.prepare(multipartOwner, f.transferId);
  await expect(f.staging.complete(multipartOther, f.transferId)).rejects.toMatchObject({ code: 'TRANSFER_NOT_FOUND' });
  await expect(f.service.sign(multipartOwner, f.transferId, 1)).rejects.toMatchObject({ code: 'TRANSFER_STATE_CONFLICT' });
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
  expect(f.storage.uploadStagedPart).not.toHaveBeenCalled();
  expect(f.tables.user[0].reservedStorageBytes).toBe(BigInt(image.length));
});

it('keeps quota reserved after a lost S3 part response and adopts the existing part on retry', async () => {
  const f = await staged();
  for (let i = 0; i < 2; i++) {
    f.fetchStage.mockResolvedValueOnce(new Response(null, { headers: stageHeaders }));
    f.fetchStage.mockResolvedValueOnce(new Response(image, { headers: { 'Content-Length': String(image.length) } }));
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

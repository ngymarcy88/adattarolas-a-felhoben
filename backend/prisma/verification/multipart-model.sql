-- Opt-in, disposable-database verification; executed only by scripts/verify-processing-schema.mjs.
-- The marker separates legacy seed data from tests run AFTER the new migration.
-- Fixtures are synthetic. This is a schema experiment, not an application integration/e2e suite.
BEGIN;

INSERT INTO "User" (id,email,"passwordHash","displayName","usedStorageBytes","reservedStorageBytes","storageLimitBytes","createdAt","updatedAt")
VALUES ('20000000-0000-4000-8000-000000000001','schema-1@example.invalid','synthetic-not-a-password','Schema fixture',128,8,1000000,'2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z');

INSERT INTO "User" (id,email,"passwordHash","displayName","usedStorageBytes","reservedStorageBytes","storageLimitBytes","createdAt","updatedAt")
VALUES ('20000000-0000-4000-8000-000000000002','schema-2@example.invalid','synthetic-not-a-password','Schema fixture',64,0,1000000,'2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z');

INSERT INTO "FileObject" (id,"ownerId","originalName","storageKey","mimeType","detectedMimeType","sizeBytes",status,"uploadUrlExpiresAt","confirmBy","createdAt","updatedAt")
VALUES ('20000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000001','fixture.png','synthetic/original/11','image/png','image/png',64,'ACTIVE','2026-10-29T00:05:00Z','2026-10-29T00:15:00Z','2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z');

INSERT INTO "FileObject" (id,"ownerId","originalName","storageKey","mimeType","detectedMimeType","sizeBytes",status,"uploadUrlExpiresAt","confirmBy","createdAt","updatedAt")
VALUES ('20000000-0000-4000-8000-000000000012','20000000-0000-4000-8000-000000000001','fixture.png','synthetic/original/12','image/png',NULL,8,'PENDING_UPLOAD','2026-10-29T00:05:00Z','2026-10-29T00:15:00Z','2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z');

INSERT INTO "FileObject" (id,"ownerId","originalName","storageKey","mimeType","detectedMimeType","sizeBytes",status,"uploadUrlExpiresAt","confirmBy","createdAt","updatedAt")
VALUES ('20000000-0000-4000-8000-000000000013','20000000-0000-4000-8000-000000000001','fixture.png','synthetic/original/13','image/png','image/png',64,'ACTIVE','2026-10-29T00:05:00Z','2026-10-29T00:15:00Z','2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z');

INSERT INTO "FileObject" (id,"ownerId","originalName","storageKey","mimeType","detectedMimeType","sizeBytes",status,"uploadUrlExpiresAt","confirmBy","createdAt","updatedAt")
VALUES ('20000000-0000-4000-8000-000000000014','20000000-0000-4000-8000-000000000002','fixture.png','synthetic/original/14','image/png','image/png',64,'ACTIVE','2026-10-29T00:05:00Z','2026-10-29T00:15:00Z','2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z');

INSERT INTO "UploadOperation" (id,"ownerId","fileObjectId","idempotencyKey","requestFingerprint","replayUntil","createdAt","updatedAt")
VALUES ('20000000-0000-4000-8000-000000000015','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000012','20000000-0000-4000-8000-000000000016','v1:'||repeat('a',64),'2026-10-30T01:00:00Z','2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z');
INSERT INTO "ShareLink" (id,"fileObjectId","createdByUserId","tokenHash","expiresAt","createdAt")
VALUES ('20000000-0000-4000-8000-000000000017','20000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000001',repeat('c',64),'2026-10-29T02:00:00Z','2026-10-29T00:00:00.000Z');
INSERT INTO "AuditEvent" (id,"actorUserId",action,"resourceType","requestId","createdAt")
VALUES ('20000000-0000-4000-8000-000000000018','20000000-0000-4000-8000-000000000001','SCHEMA_FIXTURE','FILE_OBJECT','synthetic-request','2026-10-29T00:00:00.000Z');
COMMIT;
INSERT INTO "ProcessingJob" (id,"ownerId","fileObjectId","processorKey","processorVersion","implementationFingerprint","sourceFingerprint","state",fence,"cycleAttemptCount","totalAttemptCount","finishedAt","createdAt","updatedAt")
VALUES ('20000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000011','thumbnail','1.0.0',repeat('a',64),repeat('b',64),'SUCCEEDED',1,1,1,'2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z');

INSERT INTO "ProcessingJob" (id,"ownerId","fileObjectId","processorKey","processorVersion","implementationFingerprint","sourceFingerprint","state",fence,"cycleAttemptCount","totalAttemptCount","finishedAt","createdAt","updatedAt")
VALUES ('20000000-0000-4000-8000-000000000022','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000013','thumbnail','1.0.0',repeat('a',64),repeat('b',64),'SUCCEEDED',1,1,1,'2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z');

INSERT INTO "ProcessingJob" (id,"ownerId","fileObjectId","processorKey","processorVersion","implementationFingerprint","sourceFingerprint","state",fence,"cycleAttemptCount","totalAttemptCount","finishedAt","createdAt","updatedAt")
VALUES ('20000000-0000-4000-8000-000000000023','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000014','thumbnail','1.0.0',repeat('a',64),repeat('b',64),'SUCCEEDED',1,1,1,'2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z');

INSERT INTO "ProcessingAttempt" (id,"jobId","ownerId","fileObjectId",fence,ordinal,phase,"candidateKey","sourceSha256","sourceETag","outputSha256","mimeType",width,height,"outputBytes","reservedBytes","writeStartedAt","writeSettledAt","finalizedAt","createdAt","updatedAt")
VALUES ('20000000-0000-4000-8000-000000000031','20000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000011',1,1,'PUBLISHED','derived/20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000011/20000000-0000-4000-8000-000000000021/20000000-0000-4000-8000-000000000031.webp',repeat('c',64),'synthetic-etag',repeat('d',64),'image/webp',128,128,256,256,'2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z');

INSERT INTO "ProcessingAttempt" (id,"jobId","ownerId","fileObjectId",fence,ordinal,phase,"candidateKey","sourceSha256","sourceETag","outputSha256","mimeType",width,height,"outputBytes","reservedBytes","writeStartedAt","writeSettledAt","finalizedAt","createdAt","updatedAt")
VALUES ('20000000-0000-4000-8000-000000000032','20000000-0000-4000-8000-000000000022','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000013',1,1,'PUBLISHED','derived/20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000013/20000000-0000-4000-8000-000000000022/20000000-0000-4000-8000-000000000032.webp',repeat('c',64),'synthetic-etag',repeat('d',64),'image/webp',128,128,256,256,'2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z');

INSERT INTO "ProcessingAttempt" (id,"jobId","ownerId","fileObjectId",fence,ordinal,phase,"candidateKey","sourceSha256","sourceETag","outputSha256","mimeType",width,height,"outputBytes","reservedBytes","writeStartedAt","writeSettledAt","finalizedAt","createdAt","updatedAt")
VALUES ('20000000-0000-4000-8000-000000000033','20000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000011',1,2,'PUBLISHED','derived/20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000011/20000000-0000-4000-8000-000000000021/20000000-0000-4000-8000-000000000033.webp',repeat('c',64),'synthetic-etag',repeat('d',64),'image/webp',128,128,256,256,'2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z');

INSERT INTO "DerivedObject" (id,"ownerId","fileObjectId","jobId","attemptId","processorVersion","sourceFingerprint","sourceSha256","implementationFingerprint","publicationFence","storageKey","mimeType","sizeBytes",sha256,width,height,"createdAt")
VALUES ('20000000-0000-4000-8000-000000000041','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000031','1.0.0',repeat('b',64),repeat('c',64),repeat('a',64),1,'derived/20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000011/20000000-0000-4000-8000-000000000021/20000000-0000-4000-8000-000000000031.webp','image/webp',256,repeat('d',64),128,128,'2026-10-29T00:00:00.000Z');
-- Published fixture: original 128 + one real winner256; old pending8 remains reserved.
UPDATE "User" SET "usedStorageBytes" = "usedStorageBytes" + 256 WHERE id='20000000-0000-4000-8000-000000000001';


-- Preserve a legacy soft-deleted original alongside the existing unresolved pending reservation.
INSERT INTO "FileObject" (id,"ownerId","originalName","storageKey","mimeType","detectedMimeType","sizeBytes",status,"uploadUrlExpiresAt","confirmBy","deletedAt","purgeAfter","updatedAt")
VALUES ('20000000-0000-4000-8000-000000000051','20000000-0000-4000-8000-000000000002','deleted.png','synthetic/deleted','image/png','image/png',16,'SOFT_DELETED',now(),now(),now(),now()+interval '30 days',now());
UPDATE "User" SET "usedStorageBytes"="usedStorageBytes"+16 WHERE id='20000000-0000-4000-8000-000000000002';

-- @after-migration

BEGIN;
CREATE TEMP TABLE schema_assertions (count integer NOT NULL);
INSERT INTO schema_assertions VALUES (0);
CREATE FUNCTION pg_temp.expect_sql(statement text, expected text, label text, expected_constraint text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text; constraint_name text;
BEGIN
    BEGIN
        EXECUTE statement;
        SET CONSTRAINTS ALL IMMEDIATE;
        IF expected = '00000' THEN
            RAISE EXCEPTION USING ERRCODE = 'ZV001', MESSAGE = 'Successful statement rolled back';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, constraint_name = CONSTRAINT_NAME;
        IF (expected = '00000' AND actual = 'ZV001') OR (actual = expected AND (expected_constraint IS NULL OR constraint_name = expected_constraint)) THEN
            UPDATE schema_assertions SET count = count + 1;
            RETURN;
        END IF;
        RAISE EXCEPTION 'Assertion %: expected %/%, received %/%', label, expected, expected_constraint, actual, constraint_name;
    END;
    RAISE EXCEPTION 'Assertion %: expected SQLSTATE %, statement was accepted', label, expected;
END $$;
INSERT INTO "User" (id,email,"passwordHash","displayName","reservedStorageBytes","storageLimitBytes","updatedAt") VALUES ('30000000-0000-4000-8000-000000000091','multipart-schema@example.invalid','synthetic','Schema',10485761,1073741824,now());
INSERT INTO "ImportSession" (id,"ownerId","idempotencyKey","requestFingerprint","expiresAt","replayUntil","acceptedFileCount","nextOrdinal","updatedAt")
VALUES ('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000091','30000000-0000-4000-8000-000000000002','v1:'||repeat('a',64),now()+interval '1 hour',now()+interval '25 hours',1,2,now());
INSERT INTO "FileObject" (id,"ownerId","originalName","storageKey","mimeType","sizeBytes",status,"uploadTransport","uploadUrlExpiresAt","confirmBy","updatedAt")
VALUES ('30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000091','fixture.png','synthetic/multipart','image/png',10485761,'PENDING_UPLOAD','MULTIPART',NULL,now()+interval '1 hour',now());
INSERT INTO "UploadOperation" (id,"ownerId","fileObjectId","uploadTransport","idempotencyKey","requestFingerprint","replayUntil","updatedAt")
VALUES ('30000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000091','30000000-0000-4000-8000-000000000011','MULTIPART','30000000-0000-4000-8000-000000000022','v2:'||repeat('a',64),now()+interval '25 hours',now());
INSERT INTO "ImportFile" (id,"importId","ownerId","clientFileId",ordinal,"fileObjectId") VALUES ('30000000-0000-4000-8000-000000000031','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000091','30000000-0000-4000-8000-000000000032',1,'30000000-0000-4000-8000-000000000011');
INSERT INTO "MultipartTransfer" (id,"importFileId","uploadOperationId","fileObjectId","ownerId","sizeBytes","partCount","contentSha256","providerNamespace","expiresAt","updatedAt")
VALUES ('30000000-0000-4000-8000-000000000041','30000000-0000-4000-8000-000000000031','30000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000091',10485761,3,repeat('a',64),'synthetic-schema',now()+interval '1 hour',now());
INSERT INTO "MultipartPart" ("transferId","partNumber","expectedSizeBytes") VALUES ('30000000-0000-4000-8000-000000000041',1,5242880),('30000000-0000-4000-8000-000000000041',2,5242880),('30000000-0000-4000-8000-000000000041',3,1);
INSERT INTO "MultipartIoOperation" (id,"transferId",kind,"attemptNo",fence) VALUES ('30000000-0000-4000-8000-000000000051','30000000-0000-4000-8000-000000000041','CREATE',1,0);
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

SELECT pg_temp.expect_sql($case$SELECT 1$case$,'00000','valid initial graph and geometry');
SELECT pg_temp.expect_sql($case$INSERT INTO "ImportSession" SELECT (jsonb_populate_record(NULL::"ImportSession",to_jsonb(r)||'{"id": "30000000-0000-4000-8000-000000000003"}'::jsonb)).* FROM "ImportSession" r WHERE id='30000000-0000-4000-8000-000000000001'$case$,'23505','owner import idempotency unique');
SELECT pg_temp.expect_sql($case$INSERT INTO "UploadOperation" SELECT (jsonb_populate_record(NULL::"UploadOperation",to_jsonb(r)||'{"id": "30000000-0000-4000-8000-000000000023", "idempotencyKey": "30000000-0000-4000-8000-000000000024"}'::jsonb)).* FROM "UploadOperation" r WHERE id='30000000-0000-4000-8000-000000000021'$case$,'23505','one receipt per logical original');
SELECT pg_temp.expect_sql($case$INSERT INTO "ImportFile" SELECT (jsonb_populate_record(NULL::"ImportFile",to_jsonb(r)||'{"id": "30000000-0000-4000-8000-000000000033", "fileObjectId": "30000000-0000-4000-8000-000000000099"}'::jsonb)).* FROM "ImportFile" r WHERE id='30000000-0000-4000-8000-000000000031'$case$,'23505','client file identity unique');
SELECT pg_temp.expect_sql($case$INSERT INTO "ImportFile" SELECT (jsonb_populate_record(NULL::"ImportFile",to_jsonb(r)||'{"id": "30000000-0000-4000-8000-000000000033", "clientFileId": "30000000-0000-4000-8000-000000000034", "fileObjectId": "30000000-0000-4000-8000-000000000099"}'::jsonb)).* FROM "ImportFile" r WHERE id='30000000-0000-4000-8000-000000000031'$case$,'23505','import ordinal unique');
SELECT pg_temp.expect_sql($case$INSERT INTO "MultipartTransfer" SELECT (jsonb_populate_record(NULL::"MultipartTransfer",to_jsonb(r)||'{"id": "30000000-0000-4000-8000-000000000042"}'::jsonb)).* FROM "MultipartTransfer" r WHERE id='30000000-0000-4000-8000-000000000041'$case$,'23505','one transfer per item and receipt');
SELECT pg_temp.expect_sql($case$INSERT INTO "MultipartIoOperation" SELECT (jsonb_populate_record(NULL::"MultipartIoOperation",to_jsonb(r)||'{"id": "30000000-0000-4000-8000-000000000052"}'::jsonb)).* FROM "MultipartIoOperation" r WHERE id='30000000-0000-4000-8000-000000000051'$case$,'23505','only one create operation');
SELECT pg_temp.expect_sql($case$INSERT INTO "MultipartPart" SELECT (jsonb_populate_record(NULL::"MultipartPart",to_jsonb(r)||'{}'::jsonb)).* FROM "MultipartPart" r WHERE "transferId"='30000000-0000-4000-8000-000000000041' AND "partNumber"=1$case$,'23505','no duplicate part snapshot');
SELECT pg_temp.expect_sql($case$INSERT INTO "ImportFile" SELECT (jsonb_populate_record(NULL::"ImportFile",to_jsonb(r)||'{"id": "30000000-0000-4000-8000-000000000033", "clientFileId": "30000000-0000-4000-8000-000000000034", "ordinal": 2, "ownerId": "30000000-0000-4000-8000-000000000092", "fileObjectId": "30000000-0000-4000-8000-000000000099"}'::jsonb)).* FROM "ImportFile" r WHERE id='30000000-0000-4000-8000-000000000031'$case$,'23503','cross owner graph cannot link');
SELECT pg_temp.expect_sql($case$UPDATE "ImportSession" SET "fileLimit"=51 WHERE id='30000000-0000-4000-8000-000000000001'$case$,'23514','import cap');
SELECT pg_temp.expect_sql($case$UPDATE "ImportSession" SET "acceptedFileCount"=51,"nextOrdinal"=52 WHERE id='30000000-0000-4000-8000-000000000001'$case$,'23514','import accepted cap');
SELECT pg_temp.expect_sql($case$UPDATE "ImportSession" SET "nextOrdinal"=4 WHERE id='30000000-0000-4000-8000-000000000001'$case$,'23514','ordinal counter');
SELECT pg_temp.expect_sql($case$UPDATE "ImportSession" SET "idempotencyKey"='00000000-0000-0000-0000-000000000000' WHERE id='30000000-0000-4000-8000-000000000001'$case$,'23514','import key version');
SELECT pg_temp.expect_sql($case$UPDATE "ImportSession" SET "expiresAt"='infinity' WHERE id='30000000-0000-4000-8000-000000000001'$case$,'23514','finite import expiry');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET "partCount"=2 WHERE id='30000000-0000-4000-8000-000000000041'$case$,'23514','part count exact');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET "partSizeBytes"=1048576 WHERE id='30000000-0000-4000-8000-000000000041'$case$,'23514','minimum part size');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET "partSizeBytes"=5242881 WHERE id='30000000-0000-4000-8000-000000000041'$case$,'23514','whole MiB part size');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET "sizeBytes"=1048576000 WHERE id='30000000-0000-4000-8000-000000000041'$case$,'23514','original byte ceiling');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET "contentSha256"=repeat('z',64) WHERE id='30000000-0000-4000-8000-000000000041'$case$,'23514','hash alphabet');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET "revision"=-1 WHERE id='30000000-0000-4000-8000-000000000041'$case$,'23514','negative revision');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET "fence"=-1 WHERE id='30000000-0000-4000-8000-000000000041'$case$,'23514','negative fence');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET "leaseOwner"='30000000-0000-4000-8000-000000000090' WHERE id='30000000-0000-4000-8000-000000000041'$case$,'23514','partial lease');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET "providerNamespace"='' WHERE id='30000000-0000-4000-8000-000000000041'$case$,'23514','empty namespace');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET "providerUploadId"='unexpected' WHERE id='30000000-0000-4000-8000-000000000041'$case$,'23514','create cannot already claim provider identity');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET "cleanupState"='VERIFIED' WHERE id='30000000-0000-4000-8000-000000000041'$case$,'23514','cleanup without closure proof');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET "manifestHash"=repeat('a',64) WHERE id='30000000-0000-4000-8000-000000000041'$case$,'23514','half manifest identity');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET "expiresAt"='infinity' WHERE id='30000000-0000-4000-8000-000000000041'$case$,'23514','finite transfer expiry');
SELECT pg_temp.expect_sql($case$UPDATE "FileObject" SET "uploadTransport"='SINGLE_PUT' WHERE id='30000000-0000-4000-8000-000000000011'$case$,'23514','cannot switch transport');
SELECT pg_temp.expect_sql($case$UPDATE "FileObject" SET "uploadUrlExpiresAt"=now() WHERE id='30000000-0000-4000-8000-000000000011'$case$,'23514','multipart has no legacy URL deadline');
SELECT pg_temp.expect_sql($case$UPDATE "FileObject" SET "sizeBytes"=2 WHERE id='30000000-0000-4000-8000-000000000011'$case$,'23514','accepted original size immutable');
SELECT pg_temp.expect_sql($case$UPDATE "UploadOperation" SET "requestFingerprint"='v1:'||repeat('a',64) WHERE id='30000000-0000-4000-8000-000000000021'$case$,'23514','transport fingerprint version');
SELECT pg_temp.expect_sql($case$UPDATE "UploadOperation" SET state='FINALIZED',"closedAt"=now() WHERE id='30000000-0000-4000-8000-000000000021'$case$,'23514','cannot finalize without successful transfer and active file');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET "state"='OPEN',"providerUploadId"='synthetic-upload' WHERE id='30000000-0000-4000-8000-000000000041'$case$,'00000','known provider identity can open');
SELECT pg_temp.expect_sql($case$INSERT INTO "MultipartPart" SELECT (jsonb_populate_record(NULL::"MultipartPart",to_jsonb(r)||'{"partNumber": 4}'::jsonb)).* FROM "MultipartPart" r WHERE "transferId"='30000000-0000-4000-8000-000000000041' AND "partNumber"=3$case$,'23514','part outside count');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartPart" SET "expectedSizeBytes"=2 WHERE "transferId"='30000000-0000-4000-8000-000000000041' AND "partNumber"=3$case$,'23514','last part exact size');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartPart" SET "observedSizeBytes"=1 WHERE "transferId"='30000000-0000-4000-8000-000000000041' AND "partNumber"=3$case$,'23514','observed tuple cannot be partial');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartPart" SET "maxIssuedExpiresAt"=now()+interval '2 hours',"lastIssuedRevision"=0 WHERE "transferId"='30000000-0000-4000-8000-000000000041' AND "partNumber"=3$case$,'23514','grant cannot extend session');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartPart" SET "maxIssuedExpiresAt"=now()+interval '1 minute',"lastIssuedRevision"=1 WHERE "transferId"='30000000-0000-4000-8000-000000000041' AND "partNumber"=3$case$,'23514','grant revision cannot exceed transfer');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartPart" SET "observedSizeBytes"=1,"observedETag"='not-a-checksum',"observedAt"=now() WHERE "transferId"='30000000-0000-4000-8000-000000000041' AND "partNumber"=3$case$,'00000','full storage-observation tuple only');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartIoOperation" SET "attemptNo"=2 WHERE id='30000000-0000-4000-8000-000000000051'$case$,'23514','cannot create a second provider session');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartIoOperation" SET state='UNKNOWN' WHERE id='30000000-0000-4000-8000-000000000051'$case$,'23514','unknown I/O requires dispatch and fence');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartIoOperation" SET state='FAILED',"settledAt"=now() WHERE id='30000000-0000-4000-8000-000000000051'$case$,'00000','cancelled undispatched intent can settle failed');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET state='SEALING',"providerUploadId"='synthetic-upload' WHERE id='30000000-0000-4000-8000-000000000041'; UPDATE "MultipartTransfer" SET "manifestHash"=repeat('b',64),"manifestSealedAt"=now() WHERE id='30000000-0000-4000-8000-000000000041';$case$,'23514','cannot seal empty manifest');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET state='SEALING',"providerUploadId"='synthetic-upload' WHERE id='30000000-0000-4000-8000-000000000041';
INSERT INTO "MultipartManifestPart" ("transferId","partNumber","sizeBytes",etag) VALUES ('30000000-0000-4000-8000-000000000041',1,5242880,'part1'),('30000000-0000-4000-8000-000000000041',2,5242880,'part2'),('30000000-0000-4000-8000-000000000041',3,1,'part3');
UPDATE "MultipartTransfer" SET "manifestHash"=repeat('b',64),"manifestSealedAt"=now(),state='COMPLETING' WHERE id='30000000-0000-4000-8000-000000000041';$case$,'00000','complete manifest seals once');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET state='SEALING',"providerUploadId"='synthetic-upload' WHERE id='30000000-0000-4000-8000-000000000041';
INSERT INTO "MultipartManifestPart" ("transferId","partNumber","sizeBytes",etag) VALUES ('30000000-0000-4000-8000-000000000041',1,5242880,'part1'),('30000000-0000-4000-8000-000000000041',2,5242880,'part2'),('30000000-0000-4000-8000-000000000041',3,1,'part3');
UPDATE "MultipartTransfer" SET "manifestHash"=repeat('b',64),"manifestSealedAt"=now(),state='COMPLETING' WHERE id='30000000-0000-4000-8000-000000000041';UPDATE "MultipartManifestPart" SET etag='changed' WHERE "transferId"='30000000-0000-4000-8000-000000000041' AND "partNumber"=1;$case$,'23514','sealed manifest immutable');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET state='SEALING',"providerUploadId"='synthetic-upload' WHERE id='30000000-0000-4000-8000-000000000041';
INSERT INTO "MultipartManifestPart" ("transferId","partNumber","sizeBytes",etag) VALUES ('30000000-0000-4000-8000-000000000041',1,5242880,'part1'),('30000000-0000-4000-8000-000000000041',2,5242880,'part2'),('30000000-0000-4000-8000-000000000041',3,1,'part3');
UPDATE "MultipartTransfer" SET "manifestHash"=repeat('b',64),"manifestSealedAt"=now(),state='COMPLETING' WHERE id='30000000-0000-4000-8000-000000000041';UPDATE "MultipartTransfer" SET state='OPEN' WHERE id='30000000-0000-4000-8000-000000000041';$case$,'23514','sealed transfer cannot issue new grants');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET state='SEALING',"providerUploadId"='synthetic-upload' WHERE id='30000000-0000-4000-8000-000000000041';
INSERT INTO "MultipartManifestPart" ("transferId","partNumber","sizeBytes",etag) VALUES ('30000000-0000-4000-8000-000000000041',1,5242880,'part1'),('30000000-0000-4000-8000-000000000041',2,5242880,'part2'),('30000000-0000-4000-8000-000000000041',3,1,'part3');
UPDATE "MultipartTransfer" SET "manifestHash"=repeat('b',64),"manifestSealedAt"=now(),state='COMPLETING' WHERE id='30000000-0000-4000-8000-000000000041';
UPDATE "MultipartTransfer" SET state='SUCCEEDED',"storedAt"=now(),"storedETag"='synthetic-etag',"verifiedAt"=now(),"verifiedSha256"=repeat('a',64) WHERE id='30000000-0000-4000-8000-000000000041';
UPDATE "FileObject" SET status='ACTIVE',"detectedMimeType"='image/png' WHERE id='30000000-0000-4000-8000-000000000011';
UPDATE "UploadOperation" SET state='FINALIZED',"closedAt"=now() WHERE id='30000000-0000-4000-8000-000000000021';
UPDATE "User" SET "reservedStorageBytes"="reservedStorageBytes"-10485761,"usedStorageBytes"="usedStorageBytes"+10485761 WHERE id='30000000-0000-4000-8000-000000000091';$case$,'00000','atomic synthetic finalization graph');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET state='SEALING',"providerUploadId"='synthetic-upload' WHERE id='30000000-0000-4000-8000-000000000041';
INSERT INTO "MultipartManifestPart" ("transferId","partNumber","sizeBytes",etag) VALUES ('30000000-0000-4000-8000-000000000041',1,5242880,'part1'),('30000000-0000-4000-8000-000000000041',2,5242880,'part2'),('30000000-0000-4000-8000-000000000041',3,1,'part3');
UPDATE "MultipartTransfer" SET "manifestHash"=repeat('b',64),"manifestSealedAt"=now(),state='COMPLETING' WHERE id='30000000-0000-4000-8000-000000000041';
UPDATE "MultipartTransfer" SET state='SUCCEEDED',"storedAt"=now(),"storedETag"='synthetic-etag',"verifiedAt"=now(),"verifiedSha256"=repeat('a',64) WHERE id='30000000-0000-4000-8000-000000000041';
UPDATE "FileObject" SET status='ACTIVE',"detectedMimeType"='image/png' WHERE id='30000000-0000-4000-8000-000000000011';
UPDATE "UploadOperation" SET state='FINALIZED',"closedAt"=now() WHERE id='30000000-0000-4000-8000-000000000021';
UPDATE "User" SET "reservedStorageBytes"="reservedStorageBytes"-10485761,"usedStorageBytes"="usedStorageBytes"+10485761 WHERE id='30000000-0000-4000-8000-000000000091';UPDATE "UploadOperation" SET state='OPEN',"closedAt"=NULL WHERE id='30000000-0000-4000-8000-000000000021';$case$,'23514','cannot reset accounting receipt');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET state='SEALING',"providerUploadId"='synthetic-upload' WHERE id='30000000-0000-4000-8000-000000000041';
INSERT INTO "MultipartManifestPart" ("transferId","partNumber","sizeBytes",etag) VALUES ('30000000-0000-4000-8000-000000000041',1,5242880,'part1'),('30000000-0000-4000-8000-000000000041',2,5242880,'part2'),('30000000-0000-4000-8000-000000000041',3,1,'part3');
UPDATE "MultipartTransfer" SET "manifestHash"=repeat('b',64),"manifestSealedAt"=now(),state='COMPLETING' WHERE id='30000000-0000-4000-8000-000000000041';
UPDATE "MultipartTransfer" SET state='SUCCEEDED',"storedAt"=now(),"storedETag"='synthetic-etag',"verifiedAt"=now(),"verifiedSha256"=repeat('a',64) WHERE id='30000000-0000-4000-8000-000000000041';
UPDATE "FileObject" SET status='ACTIVE',"detectedMimeType"='image/png' WHERE id='30000000-0000-4000-8000-000000000011';
UPDATE "UploadOperation" SET state='FINALIZED',"closedAt"=now() WHERE id='30000000-0000-4000-8000-000000000021';
UPDATE "User" SET "reservedStorageBytes"="reservedStorageBytes"-10485761,"usedStorageBytes"="usedStorageBytes"+10485761 WHERE id='30000000-0000-4000-8000-000000000091';UPDATE "MultipartTransfer" SET state='STORED' WHERE id='30000000-0000-4000-8000-000000000041';$case$,'23514','successful transfer terminal');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET state='CANCELLED',"publicationExcludedAt"=now(),"cleanupState"='CLEANUP_BLOCKED' WHERE id='30000000-0000-4000-8000-000000000041'; UPDATE "UploadOperation" SET state='CANCELLED',"terminalErrorCode"='UPLOAD_CANCELLED',"closedAt"=now() WHERE id='30000000-0000-4000-8000-000000000021';$case$,'00000','cancel retains reservation without proof');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET state='CANCELLED',"publicationExcludedAt"=now(),"cleanupState"='CLEANUP_BLOCKED' WHERE id='30000000-0000-4000-8000-000000000041'; UPDATE "UploadOperation" SET state='CANCELLED',"terminalErrorCode"='UPLOAD_CANCELLED',"closedAt"=now() WHERE id='30000000-0000-4000-8000-000000000021';UPDATE "UploadOperation" SET "writesClosedAt"=now(),"reservationReleasedAt"=now() WHERE id='30000000-0000-4000-8000-000000000021';$case$,'23514','abort or timestamp alone cannot release');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET state='CANCELLED',"publicationExcludedAt"=now(),"cleanupState"='CLEANUP_BLOCKED' WHERE id='30000000-0000-4000-8000-000000000041'; UPDATE "UploadOperation" SET state='CANCELLED',"terminalErrorCode"='UPLOAD_CANCELLED',"closedAt"=now() WHERE id='30000000-0000-4000-8000-000000000021';UPDATE "MultipartIoOperation" SET state='FAILED',"settledAt"=now() WHERE "transferId"='30000000-0000-4000-8000-000000000041'; UPDATE "MultipartTransfer" SET "cleanupState"='VERIFIED',"writesClosedAt"=now(),"closureEvidenceType"='synthetic-only',"closureEvidenceRef"='not-provider-evidence',"objectAbsentAt"=now(),"partsAbsentAt"=now() WHERE id='30000000-0000-4000-8000-000000000041'; UPDATE "UploadOperation" SET "writesClosedAt"=now(),"reservationReleasedAt"=now() WHERE id='30000000-0000-4000-8000-000000000021'; UPDATE "User" SET "reservedStorageBytes"="reservedStorageBytes"-10485761 WHERE id='30000000-0000-4000-8000-000000000091';$case$,'00000','synthetic positive evidence shape plus atomic release');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET state='CANCELLED',"publicationExcludedAt"=now(),"cleanupState"='CLEANUP_BLOCKED' WHERE id='30000000-0000-4000-8000-000000000041'; UPDATE "UploadOperation" SET state='CANCELLED',"terminalErrorCode"='UPLOAD_CANCELLED',"closedAt"=now() WHERE id='30000000-0000-4000-8000-000000000021';UPDATE "MultipartIoOperation" SET state='FAILED',"settledAt"=now() WHERE "transferId"='30000000-0000-4000-8000-000000000041'; UPDATE "MultipartTransfer" SET "cleanupState"='VERIFIED',"writesClosedAt"=now(),"closureEvidenceType"='synthetic-only',"closureEvidenceRef"='not-provider-evidence',"objectAbsentAt"=now(),"partsAbsentAt"=now() WHERE id='30000000-0000-4000-8000-000000000041'; UPDATE "UploadOperation" SET "writesClosedAt"=now(),"reservationReleasedAt"=now() WHERE id='30000000-0000-4000-8000-000000000021'; UPDATE "User" SET "reservedStorageBytes"="reservedStorageBytes"-10485761 WHERE id='30000000-0000-4000-8000-000000000091';UPDATE "UploadOperation" SET "reservationReleasedAt"=NULL WHERE id='30000000-0000-4000-8000-000000000021';$case$,'23514','cannot reset release marker');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartTransfer" SET state='CANCELLED',"publicationExcludedAt"=now(),"cleanupState"='CLEANUP_BLOCKED' WHERE id='30000000-0000-4000-8000-000000000041'; UPDATE "UploadOperation" SET state='CANCELLED',"terminalErrorCode"='UPLOAD_CANCELLED',"closedAt"=now() WHERE id='30000000-0000-4000-8000-000000000021';UPDATE "MultipartTransfer" SET "cleanupState"='VERIFIED',"writesClosedAt"=now(),"closureEvidenceType"='unproven',"closureEvidenceRef"='not-provider-evidence',"objectAbsentAt"=now(),"partsAbsentAt"=now() WHERE id='30000000-0000-4000-8000-000000000041';$case$,'23514','unproven is never positive closure');
SELECT pg_temp.expect_sql($case$DELETE FROM "MultipartPart" WHERE "transferId"='30000000-0000-4000-8000-000000000041';$case$,'23514','unresolved part evidence retained');
SELECT pg_temp.expect_sql($case$DELETE FROM "MultipartIoOperation" WHERE "transferId"='30000000-0000-4000-8000-000000000041';$case$,'23514','unresolved I/O retained');
SELECT pg_temp.expect_sql($case$UPDATE "User" SET "reservedStorageBytes"=-1 WHERE id='30000000-0000-4000-8000-000000000091'$case$,'23514','legacy nonnegative quota check retained');
SELECT pg_temp.expect_sql($case$UPDATE "User" SET "usedStorageBytes"=1073741824 WHERE id='30000000-0000-4000-8000-000000000091'$case$,'23514','legacy combined quota check retained');
SELECT pg_temp.expect_sql($case$UPDATE "MultipartPart" SET "partNumber"=2147483647 WHERE "transferId"='30000000-0000-4000-8000-000000000041' AND "partNumber"=1$case$,'23514','extreme part ordinal rejected before arithmetic');
SELECT pg_temp.expect_sql($case$UPDATE "UploadOperation" SET "writesClosedAt"=now() WHERE id='30000000-0000-4000-8000-000000000021'$case$,'23514','cannot invent closure marker on open transfer');
SELECT 'SCHEMA_ASSERTIONS_PASS='||count FROM schema_assertions;
ROLLBACK;

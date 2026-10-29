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
-- @after-migration
BEGIN;
CREATE TEMP TABLE schema_assertions (count integer NOT NULL);
INSERT INTO schema_assertions VALUES (0);
CREATE FUNCTION pg_temp.expect_sql(statement text, expected text, label text, expected_constraint text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text; constraint_name text;
BEGIN
    BEGIN
        EXECUTE statement;
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

SELECT pg_temp.expect_sql($case$INSERT INTO "ProcessingJob" SELECT (jsonb_populate_record(NULL::"ProcessingJob", to_jsonb(t) || '{"id": "20000000-0000-4000-8000-000000000024"}'::jsonb)).* FROM "ProcessingJob" t WHERE id='20000000-0000-4000-8000-000000000021' $case$,'23505','duplicate logical job','ProcessingJob_logical_identity_key');

SELECT pg_temp.expect_sql($case$INSERT INTO "ProcessingJob" SELECT (jsonb_populate_record(NULL::"ProcessingJob", to_jsonb(t) || '{"id": "20000000-0000-4000-8000-000000000024", "processorVersion": "1.0.1"}'::jsonb)).* FROM "ProcessingJob" t WHERE id='20000000-0000-4000-8000-000000000021' $case$,'00000','new processor version is independent');

SELECT pg_temp.expect_sql($case$INSERT INTO "ProcessingJob" SELECT (jsonb_populate_record(NULL::"ProcessingJob", to_jsonb(t) || '{"id": "20000000-0000-4000-8000-000000000024", "ownerId": "20000000-0000-4000-8000-000000000002"}'::jsonb)).* FROM "ProcessingJob" t WHERE id='20000000-0000-4000-8000-000000000021' $case$,'23503','foreign owner file job');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingJob" SET "fence"=-1 WHERE id='20000000-0000-4000-8000-000000000021'$case$,'23514','job invalid fence');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingJob" SET "retryRevision"=3 WHERE id='20000000-0000-4000-8000-000000000021'$case$,'23514','job invalid retryRevision');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingJob" SET "cycleAttemptCount"=4 WHERE id='20000000-0000-4000-8000-000000000021'$case$,'23514','job invalid cycleAttemptCount');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingJob" SET "recoveryProbeCount"=4 WHERE id='20000000-0000-4000-8000-000000000021'$case$,'23514','job invalid recoveryProbeCount');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingJob" SET "totalAttemptCount"=10 WHERE id='20000000-0000-4000-8000-000000000021'$case$,'23514','job invalid totalAttemptCount');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingJob" SET "implementationFingerprint"='not-a-hash' WHERE id='20000000-0000-4000-8000-000000000021'$case$,'23514','job invalid implementationFingerprint');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingJob" SET "sourceFingerprint"='bad' WHERE id='20000000-0000-4000-8000-000000000021'$case$,'23514','job invalid sourceFingerprint');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingJob" SET "processorVersion"='latest' WHERE id='20000000-0000-4000-8000-000000000021'$case$,'23514','job invalid processorVersion');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingJob" SET "processorKey"='' WHERE id='20000000-0000-4000-8000-000000000021'$case$,'23514','job invalid processorKey');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingJob" SET "lastErrorCode"='raw provider text' WHERE id='20000000-0000-4000-8000-000000000021'$case$,'23514','job invalid lastErrorCode');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingJob" SET "createdAt"='-infinity' WHERE id='20000000-0000-4000-8000-000000000021'$case$,'23514','job invalid createdAt');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingJob" SET "updatedAt"='infinity' WHERE id='20000000-0000-4000-8000-000000000021'$case$,'23514','job invalid updatedAt');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingJob" SET "state"='RUNNING',"finishedAt"=NULL WHERE id='20000000-0000-4000-8000-000000000021'$case$,'23514','running without lease');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingJob" SET "state"='RUNNING',"finishedAt"=NULL,"leaseOwner"='20000000-0000-4000-8000-000000000090',"leaseUntil"='2026-10-29T00:01:30Z' WHERE id='20000000-0000-4000-8000-000000000021'$case$,'00000','complete running lease');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingJob" SET "state"='RETRY_WAIT',"finishedAt"=NULL,"lastErrorCode"='PROCESSOR_TIMEOUT' WHERE id='20000000-0000-4000-8000-000000000021'$case$,'23514','retry wait without deadline');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingJob" SET "state"='FAILED',"lastErrorCode"=NULL WHERE id='20000000-0000-4000-8000-000000000021'$case$,'23514','failed without safe code');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingJob" SET "finishedAt"=NULL WHERE id='20000000-0000-4000-8000-000000000021'$case$,'23514','success without finished marker');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingJob" SET "retryRevision"=0,"totalAttemptCount"=4,"fence"=4 WHERE id='20000000-0000-4000-8000-000000000021'$case$,'23514','lifetime cycle budget');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingJob" SET "cycleAttemptCount"=2,"totalAttemptCount"=1 WHERE id='20000000-0000-4000-8000-000000000021'$case$,'23514','cycle exceeds lifetime');

SELECT pg_temp.expect_sql($case$INSERT INTO "ProcessingAttempt" SELECT (jsonb_populate_record(NULL::"ProcessingAttempt", to_jsonb(t) || '{"id": "20000000-0000-4000-8000-000000000034", "candidateKey": "derived/20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000011/20000000-0000-4000-8000-000000000021/20000000-0000-4000-8000-000000000034.webp"}'::jsonb)).* FROM "ProcessingAttempt" t WHERE id='20000000-0000-4000-8000-000000000031' $case$,'23505','duplicate attempt ordinal','ProcessingAttempt_jobId_ordinal_key');

SELECT pg_temp.expect_sql($case$INSERT INTO "ProcessingAttempt" SELECT (jsonb_populate_record(NULL::"ProcessingAttempt", to_jsonb(t) || '{"id": "20000000-0000-4000-8000-000000000035", "jobId": "20000000-0000-4000-8000-000000000021", "ordinal": 3, "candidateKey": "derived/20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000013/20000000-0000-4000-8000-000000000021/20000000-0000-4000-8000-000000000035.webp"}'::jsonb)).* FROM "ProcessingAttempt" t WHERE id='20000000-0000-4000-8000-000000000032' $case$,'23503','attempt cannot reference another file job');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "outputBytes"=NULL WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','attempt invalid outputBytes NULL');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "sourceSha256"=NULL WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','attempt invalid sourceSha256 NULL');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "outputSha256"=NULL WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','attempt invalid outputSha256 NULL');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "mimeType"=NULL WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','attempt invalid mimeType NULL');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "width"=NULL WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','attempt invalid width NULL');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "height"=NULL WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','attempt invalid height NULL');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "reservedBytes"=255 WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','attempt invalid reservedBytes 255');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "width"=513 WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','attempt invalid width 513');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "height"=0 WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','attempt invalid height 0');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "outputBytes"=524289 WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','attempt invalid outputBytes 524289');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "outputSha256"='bad' WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','attempt invalid outputSha256 ''bad''');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "sourceETag"='' WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','attempt invalid sourceETag ''''');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "mimeType"='text/html' WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','attempt invalid mimeType ''text/html''');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "ordinal"=0 WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','attempt invalid ordinal 0');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "fence"=0 WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','attempt invalid fence 0');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "candidateKey"='arbitrary/key.webp' WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','attempt invalid candidateKey ''arbitrary/key.webp''');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "cleanupAttemptCount"=-1 WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','attempt invalid cleanupAttemptCount -1');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "phase"='PREPARING' WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','preparing cannot retain write reservation');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "phase"='RELEASED',"finalizedAt"=NULL,"reservationReleasedAt"='2026-10-29T00:00:00.000Z' WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','no quota release without proof and absence');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "phase"='CLEANUP_BLOCKED',"finalizedAt"=NULL WHERE id='20000000-0000-4000-8000-000000000033'$case$,'00000','unknown write keeps full reservation');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "phase"='RELEASED',"finalizedAt"=NULL,"reservationReleasedAt"='2026-10-29T00:00:00.000Z',"writesClosedAt"='2026-10-29T00:00:00.000Z',"closureEvidenceType"='TEST_PROOF',"closureEvidenceRef"='synthetic-proof',"objectAbsentAt"='2026-10-29T00:00:00.000Z' WHERE id='20000000-0000-4000-8000-000000000033'$case$,'00000','released row requires full proof shape not service-proof truth');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "phase"='RELEASED',"finalizedAt"=NULL,"reservationReleasedAt"='2026-10-29T00:00:00.000Z',"writesClosedAt"='2026-10-29T00:00:00.000Z',"closureEvidenceType"='TEST_PROOF',"closureEvidenceRef"=NULL,"objectAbsentAt"='2026-10-29T00:00:00.000Z' WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','missing release closureEvidenceRef');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "phase"='RELEASED',"finalizedAt"=NULL,"reservationReleasedAt"='2026-10-29T00:00:00.000Z',"writesClosedAt"='2026-10-29T00:00:00.000Z',"closureEvidenceType"=NULL,"closureEvidenceRef"='synthetic-proof',"objectAbsentAt"='2026-10-29T00:00:00.000Z' WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','missing release closureEvidenceType');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "phase"='RELEASED',"finalizedAt"=NULL,"reservationReleasedAt"='2026-10-29T00:00:00.000Z',"writesClosedAt"=NULL,"closureEvidenceType"='TEST_PROOF',"closureEvidenceRef"='synthetic-proof',"objectAbsentAt"='2026-10-29T00:00:00.000Z' WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','missing release writesClosedAt');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "phase"='RELEASED',"finalizedAt"=NULL,"reservationReleasedAt"='2026-10-29T00:00:00.000Z',"writesClosedAt"='2026-10-29T00:00:00.000Z',"closureEvidenceType"='TEST_PROOF',"closureEvidenceRef"='synthetic-proof',"objectAbsentAt"=NULL WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','missing release objectAbsentAt');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "phase"='RELEASED',"finalizedAt"=NULL,"reservationReleasedAt"='2026-10-29T00:00:00.000Z',"writesClosedAt"='2026-10-29T00:00:00.000Z',"closureEvidenceType"='TEST_PROOF',"closureEvidenceRef"='',"objectAbsentAt"='2026-10-29T00:00:00.000Z' WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','empty proof rejected');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "reservationReleasedAt"='2026-10-29T00:00:00.000Z' WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','release and publication are exclusive');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "writeSettledAt"='2026-10-28T23:59:59Z' WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','settled before write start');

SELECT pg_temp.expect_sql($case$UPDATE "ProcessingAttempt" SET "writeStartedAt"='infinity' WHERE id='20000000-0000-4000-8000-000000000033'$case$,'23514','attempt timestamp finite');

SELECT pg_temp.expect_sql($case$INSERT INTO "DerivedObject" SELECT (jsonb_populate_record(NULL::"DerivedObject", to_jsonb(t) || '{"id": "20000000-0000-4000-8000-000000000042", "attemptId": "20000000-0000-4000-8000-000000000033", "storageKey": "derived/20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000011/20000000-0000-4000-8000-000000000021/20000000-0000-4000-8000-000000000033.webp"}'::jsonb)).* FROM "DerivedObject" t WHERE id='20000000-0000-4000-8000-000000000041' $case$,'23505','second logical result forbidden','DerivedObject_jobId_kind_key');

SELECT pg_temp.expect_sql($case$UPDATE "DerivedObject" SET "width"=513 WHERE id='20000000-0000-4000-8000-000000000041'$case$,'23514','result invalid width');

SELECT pg_temp.expect_sql($case$UPDATE "DerivedObject" SET "height"=0 WHERE id='20000000-0000-4000-8000-000000000041'$case$,'23514','result invalid height');

SELECT pg_temp.expect_sql($case$UPDATE "DerivedObject" SET "sizeBytes"=524289 WHERE id='20000000-0000-4000-8000-000000000041'$case$,'23514','result invalid sizeBytes');

SELECT pg_temp.expect_sql($case$UPDATE "DerivedObject" SET "mimeType"='image/svg+xml' WHERE id='20000000-0000-4000-8000-000000000041'$case$,'23514','result invalid mimeType');

SELECT pg_temp.expect_sql($case$UPDATE "DerivedObject" SET "publicationFence"=0 WHERE id='20000000-0000-4000-8000-000000000041'$case$,'23514','result invalid publicationFence');

SELECT pg_temp.expect_sql($case$UPDATE "DerivedObject" SET "sourceSha256"='bad' WHERE id='20000000-0000-4000-8000-000000000041'$case$,'23514','result invalid sourceSha256');

SELECT pg_temp.expect_sql($case$UPDATE "DerivedObject" SET "state"='PURGED' WHERE id='20000000-0000-4000-8000-000000000041'$case$,'23514','result invalid state');

SELECT pg_temp.expect_sql($case$UPDATE "DerivedObject" SET "purgedAt"='2026-10-29T00:00:00.000Z' WHERE id='20000000-0000-4000-8000-000000000041'$case$,'23514','result invalid purgedAt');

SELECT pg_temp.expect_sql($case$UPDATE "DerivedObject" SET "state"='PURGED',"purgedAt"='2026-10-29T00:00:00.000Z' WHERE id='20000000-0000-4000-8000-000000000041'$case$,'00000','purged tombstone shape');

SELECT pg_temp.expect_sql($case$INSERT INTO "DerivedObject" SELECT (jsonb_populate_record(NULL::"DerivedObject", to_jsonb(t) || '{"id": "20000000-0000-4000-8000-000000000042", "jobId": "20000000-0000-4000-8000-000000000022", "fileObjectId": "20000000-0000-4000-8000-000000000013", "attemptId": "20000000-0000-4000-8000-000000000032", "storageKey": "derived/20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000013/20000000-0000-4000-8000-000000000022/20000000-0000-4000-8000-000000000032.webp"}'::jsonb)).* FROM "DerivedObject" t WHERE id='20000000-0000-4000-8000-000000000041' $case$,'00000','matching job file attempt and key');

SELECT pg_temp.expect_sql($case$INSERT INTO "DerivedObject" SELECT (jsonb_populate_record(NULL::"DerivedObject", to_jsonb(t) || '{"id": "20000000-0000-4000-8000-000000000042", "jobId": "20000000-0000-4000-8000-000000000022", "fileObjectId": "20000000-0000-4000-8000-000000000013", "attemptId": "20000000-0000-4000-8000-000000000032", "storageKey": "derived/20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000013/20000000-0000-4000-8000-000000000022/20000000-0000-4000-8000-000000000032.webp", "ownerId": "20000000-0000-4000-8000-000000000002"}'::jsonb)).* FROM "DerivedObject" t WHERE id='20000000-0000-4000-8000-000000000041' $case$,'23503','result compound FK ownerId');

SELECT pg_temp.expect_sql($case$INSERT INTO "DerivedObject" SELECT (jsonb_populate_record(NULL::"DerivedObject", to_jsonb(t) || '{"id": "20000000-0000-4000-8000-000000000042", "jobId": "20000000-0000-4000-8000-000000000022", "fileObjectId": "20000000-0000-4000-8000-000000000011", "attemptId": "20000000-0000-4000-8000-000000000032", "storageKey": "derived/20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000013/20000000-0000-4000-8000-000000000022/20000000-0000-4000-8000-000000000032.webp"}'::jsonb)).* FROM "DerivedObject" t WHERE id='20000000-0000-4000-8000-000000000041' $case$,'23503','result compound FK fileObjectId');

SELECT pg_temp.expect_sql($case$INSERT INTO "DerivedObject" SELECT (jsonb_populate_record(NULL::"DerivedObject", to_jsonb(t) || '{"id": "20000000-0000-4000-8000-000000000042", "jobId": "20000000-0000-4000-8000-000000000023", "fileObjectId": "20000000-0000-4000-8000-000000000013", "attemptId": "20000000-0000-4000-8000-000000000032", "storageKey": "derived/20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000013/20000000-0000-4000-8000-000000000022/20000000-0000-4000-8000-000000000032.webp"}'::jsonb)).* FROM "DerivedObject" t WHERE id='20000000-0000-4000-8000-000000000041' $case$,'23503','result compound FK jobId');

SELECT pg_temp.expect_sql($case$INSERT INTO "DerivedObject" SELECT (jsonb_populate_record(NULL::"DerivedObject", to_jsonb(t) || '{"id": "20000000-0000-4000-8000-000000000042", "jobId": "20000000-0000-4000-8000-000000000022", "fileObjectId": "20000000-0000-4000-8000-000000000013", "attemptId": "20000000-0000-4000-8000-000000000033", "storageKey": "derived/20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000013/20000000-0000-4000-8000-000000000022/20000000-0000-4000-8000-000000000032.webp"}'::jsonb)).* FROM "DerivedObject" t WHERE id='20000000-0000-4000-8000-000000000041' $case$,'23503','result compound FK attemptId');

SELECT pg_temp.expect_sql($case$INSERT INTO "DerivedObject" SELECT (jsonb_populate_record(NULL::"DerivedObject", to_jsonb(t) || '{"id": "20000000-0000-4000-8000-000000000042", "jobId": "20000000-0000-4000-8000-000000000022", "fileObjectId": "20000000-0000-4000-8000-000000000013", "attemptId": "20000000-0000-4000-8000-000000000032", "storageKey": "derived/20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000013/20000000-0000-4000-8000-000000000022/20000000-0000-4000-8000-000000000034.webp"}'::jsonb)).* FROM "DerivedObject" t WHERE id='20000000-0000-4000-8000-000000000041' $case$,'23503','result compound FK storageKey');

SELECT pg_temp.expect_sql($case$DELETE FROM "User" WHERE id='20000000-0000-4000-8000-000000000001'$case$,'23503','restrict deletion User');

SELECT pg_temp.expect_sql($case$DELETE FROM "FileObject" WHERE id='20000000-0000-4000-8000-000000000011'$case$,'23503','restrict deletion FileObject');

SELECT pg_temp.expect_sql($case$DELETE FROM "ProcessingJob" WHERE id='20000000-0000-4000-8000-000000000021'$case$,'23503','restrict deletion ProcessingJob');

SELECT pg_temp.expect_sql($case$DELETE FROM "ProcessingAttempt" WHERE id='20000000-0000-4000-8000-000000000031'$case$,'23503','restrict deletion ProcessingAttempt');

SELECT pg_temp.expect_sql($case$UPDATE "User" SET "reservedStorageBytes"=-1 WHERE id='20000000-0000-4000-8000-000000000001'$case$,'23514','original nonnegative quota constraint retained','User_storage_accounting_check');

SELECT pg_temp.expect_sql($case$UPDATE "User" SET "usedStorageBytes"=1000001 WHERE id='20000000-0000-4000-8000-000000000001'$case$,'23514','original quota ceiling retained','User_storage_accounting_check');

SELECT 'SCHEMA_ASSERTIONS_PASS=' || count FROM schema_assertions;
ROLLBACK;

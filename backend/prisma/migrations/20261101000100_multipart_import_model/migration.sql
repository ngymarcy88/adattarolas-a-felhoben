BEGIN;
-- Additive upgrade; existing pending/active/deleted rows, counters, receipts and processing results are preserved.
-- New enum labels are compared as text in replaced CHECKs: no use of uncommitted enum literals.
LOCK TABLE "User", "FileObject", "UploadOperation" IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE "FileObject" DROP CONSTRAINT "FileObject_upload_deadline_check";
ALTER TABLE "UploadOperation" DROP CONSTRAINT "UploadOperation_fingerprint_check", DROP CONSTRAINT "UploadOperation_state_check", DROP CONSTRAINT "UploadOperation_release_check";
-- CreateEnum
CREATE TYPE "UploadTransport" AS ENUM ('SINGLE_PUT', 'MULTIPART');

-- CreateEnum
CREATE TYPE "ImportSessionState" AS ENUM ('OPEN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MultipartTransferState" AS ENUM ('CREATING', 'CREATE_UNKNOWN', 'OPEN', 'SEALING', 'COMPLETING', 'COMPLETE_UNKNOWN', 'STORED', 'CONFIRMING', 'SUCCEEDED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MultipartCleanupState" AS ENUM ('NOT_REQUIRED', 'PENDING', 'CLEANUP_BLOCKED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "MultipartIoKind" AS ENUM ('CREATE', 'COMPLETE', 'ABORT');

-- CreateEnum
CREATE TYPE "MultipartIoState" AS ENUM ('INTENT', 'DISPATCHED', 'UNKNOWN', 'SUCCEEDED', 'FAILED');

-- AlterEnum
ALTER TYPE "UploadOperationState" ADD VALUE 'CANCELLED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UploadTerminalErrorCode" ADD VALUE 'UPLOAD_CANCELLED';
ALTER TYPE "UploadTerminalErrorCode" ADD VALUE 'TRANSFER_PARTS_INVALID';

-- DropForeignKey
ALTER TABLE "UploadOperation" DROP CONSTRAINT "UploadOperation_fileObjectId_ownerId_fkey";

-- AlterTable
ALTER TABLE "FileObject" ADD COLUMN     "uploadTransport" "UploadTransport" NOT NULL DEFAULT 'SINGLE_PUT',
ALTER COLUMN "uploadUrlExpiresAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "UploadOperation" ADD COLUMN     "uploadTransport" "UploadTransport" NOT NULL DEFAULT 'SINGLE_PUT';

-- CreateTable
CREATE TABLE "ImportSession" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "requestFingerprint" VARCHAR(67) NOT NULL,
    "state" "ImportSessionState" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "replayUntil" TIMESTAMPTZ(3) NOT NULL,
    "fileLimit" INTEGER NOT NULL DEFAULT 50,
    "acceptedFileCount" INTEGER NOT NULL DEFAULT 0,
    "nextOrdinal" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ImportSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportFile" (
    "id" UUID NOT NULL,
    "importId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "clientFileId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "fileObjectId" UUID NOT NULL,
    "uploadTransport" "UploadTransport" NOT NULL DEFAULT 'MULTIPART',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MultipartTransfer" (
    "id" UUID NOT NULL,
    "importFileId" UUID NOT NULL,
    "uploadOperationId" UUID NOT NULL,
    "fileObjectId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "uploadTransport" "UploadTransport" NOT NULL DEFAULT 'MULTIPART',
    "state" "MultipartTransferState" NOT NULL DEFAULT 'CREATING',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "sizeBytes" BIGINT NOT NULL,
    "partSizeBytes" INTEGER NOT NULL DEFAULT 5242880,
    "partCount" INTEGER NOT NULL,
    "contentSha256" CHAR(64) NOT NULL,
    "providerNamespace" VARCHAR(255) NOT NULL,
    "providerUploadId" VARCHAR(2048),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "leaseOwner" UUID,
    "leaseUntil" TIMESTAMPTZ(3),
    "fence" BIGINT NOT NULL DEFAULT 0,
    "recoveryAfter" TIMESTAMPTZ(3),
    "recoveryAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" VARCHAR(100),
    "manifestHash" CHAR(64),
    "manifestSealedAt" TIMESTAMPTZ(3),
    "storedETag" VARCHAR(256),
    "storedVersionId" VARCHAR(1024),
    "storedAt" TIMESTAMPTZ(3),
    "verifiedSha256" CHAR(64),
    "verifiedAt" TIMESTAMPTZ(3),
    "cleanupState" "MultipartCleanupState" NOT NULL DEFAULT 'NOT_REQUIRED',
    "publicationExcludedAt" TIMESTAMPTZ(3),
    "writesClosedAt" TIMESTAMPTZ(3),
    "closureEvidenceType" VARCHAR(64),
    "closureEvidenceRef" VARCHAR(255),
    "objectAbsentAt" TIMESTAMPTZ(3),
    "partsAbsentAt" TIMESTAMPTZ(3),
    "cleanupRetryAfter" TIMESTAMPTZ(3),
    "cleanupAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MultipartTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MultipartPart" (
    "transferId" UUID NOT NULL,
    "partNumber" INTEGER NOT NULL,
    "expectedSizeBytes" INTEGER NOT NULL,
    "observedSizeBytes" INTEGER,
    "observedETag" VARCHAR(256),
    "observedAt" TIMESTAMPTZ(3),
    "maxIssuedExpiresAt" TIMESTAMPTZ(3),
    "lastIssuedRevision" INTEGER,

    CONSTRAINT "MultipartPart_pkey" PRIMARY KEY ("transferId","partNumber")
);

-- CreateTable
CREATE TABLE "MultipartManifestPart" (
    "transferId" UUID NOT NULL,
    "partNumber" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "etag" VARCHAR(256) NOT NULL,

    CONSTRAINT "MultipartManifestPart_pkey" PRIMARY KEY ("transferId","partNumber")
);

-- CreateTable
CREATE TABLE "MultipartIoOperation" (
    "id" UUID NOT NULL,
    "transferId" UUID NOT NULL,
    "kind" "MultipartIoKind" NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "fence" BIGINT NOT NULL,
    "state" "MultipartIoState" NOT NULL DEFAULT 'INTENT',
    "startedAt" TIMESTAMPTZ(3),
    "settledAt" TIMESTAMPTZ(3),
    "lastErrorCode" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MultipartIoOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportSession_ownerId_createdAt_id_idx" ON "ImportSession"("ownerId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ImportSession_state_expiresAt_idx" ON "ImportSession"("state", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportSession_ownerId_idempotencyKey_key" ON "ImportSession"("ownerId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ImportSession_id_ownerId_key" ON "ImportSession"("id", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportFile_fileObjectId_key" ON "ImportFile"("fileObjectId");

-- CreateIndex
CREATE INDEX "ImportFile_importId_ordinal_id_idx" ON "ImportFile"("importId", "ordinal", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ImportFile_importId_clientFileId_key" ON "ImportFile"("importId", "clientFileId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportFile_importId_ordinal_key" ON "ImportFile"("importId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "ImportFile_file_transport_key" ON "ImportFile"("fileObjectId", "ownerId", "uploadTransport");

-- CreateIndex
CREATE UNIQUE INDEX "ImportFile_transfer_identity_key" ON "ImportFile"("id", "fileObjectId", "ownerId", "uploadTransport");

-- CreateIndex
CREATE UNIQUE INDEX "MultipartTransfer_importFileId_key" ON "MultipartTransfer"("importFileId");

-- CreateIndex
CREATE UNIQUE INDEX "MultipartTransfer_uploadOperationId_key" ON "MultipartTransfer"("uploadOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "MultipartTransfer_fileObjectId_key" ON "MultipartTransfer"("fileObjectId");

-- CreateIndex
CREATE INDEX "MultipartTransfer_state_recoveryAfter_leaseUntil_idx" ON "MultipartTransfer"("state", "recoveryAfter", "leaseUntil");

-- CreateIndex
CREATE INDEX "MultipartTransfer_cleanupState_cleanupRetryAfter_idx" ON "MultipartTransfer"("cleanupState", "cleanupRetryAfter");

-- CreateIndex
CREATE UNIQUE INDEX "MultipartTransfer_import_identity_key" ON "MultipartTransfer"("importFileId", "fileObjectId", "ownerId", "uploadTransport");

-- CreateIndex
CREATE UNIQUE INDEX "MultipartTransfer_upload_identity_key" ON "MultipartTransfer"("uploadOperationId", "fileObjectId", "ownerId", "uploadTransport");

-- CreateIndex
CREATE UNIQUE INDEX "MultipartTransfer_provider_identity_key" ON "MultipartTransfer"("providerNamespace", "providerUploadId");

-- CreateIndex
CREATE INDEX "MultipartIoOperation_state_createdAt_idx" ON "MultipartIoOperation"("state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MultipartIoOperation_transferId_kind_attemptNo_key" ON "MultipartIoOperation"("transferId", "kind", "attemptNo");

-- CreateIndex
CREATE UNIQUE INDEX "FileObject_transport_identity_key" ON "FileObject"("id", "ownerId", "uploadTransport");

-- CreateIndex
CREATE UNIQUE INDEX "UploadOperation_file_transport_key" ON "UploadOperation"("fileObjectId", "ownerId", "uploadTransport");

-- CreateIndex
CREATE UNIQUE INDEX "UploadOperation_transfer_identity_key" ON "UploadOperation"("id", "fileObjectId", "ownerId", "uploadTransport");

-- AddForeignKey
ALTER TABLE "UploadOperation" ADD CONSTRAINT "UploadOperation_file_transport_fkey" FOREIGN KEY ("fileObjectId", "ownerId", "uploadTransport") REFERENCES "FileObject"("id", "ownerId", "uploadTransport") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportSession" ADD CONSTRAINT "ImportSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportFile" ADD CONSTRAINT "ImportFile_importId_ownerId_fkey" FOREIGN KEY ("importId", "ownerId") REFERENCES "ImportSession"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportFile" ADD CONSTRAINT "ImportFile_file_transport_fkey" FOREIGN KEY ("fileObjectId", "ownerId", "uploadTransport") REFERENCES "FileObject"("id", "ownerId", "uploadTransport") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultipartTransfer" ADD CONSTRAINT "MultipartTransfer_import_identity_fkey" FOREIGN KEY ("importFileId", "fileObjectId", "ownerId", "uploadTransport") REFERENCES "ImportFile"("id", "fileObjectId", "ownerId", "uploadTransport") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultipartTransfer" ADD CONSTRAINT "MultipartTransfer_upload_identity_fkey" FOREIGN KEY ("uploadOperationId", "fileObjectId", "ownerId", "uploadTransport") REFERENCES "UploadOperation"("id", "fileObjectId", "ownerId", "uploadTransport") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultipartPart" ADD CONSTRAINT "MultipartPart_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "MultipartTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultipartManifestPart" ADD CONSTRAINT "MultipartManifestPart_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "MultipartTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultipartIoOperation" ADD CONSTRAINT "MultipartIoOperation_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "MultipartTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-shape checks not representable in Prisma DSL.
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_upload_deadline_check" CHECK ((
    ("uploadTransport" = 'SINGLE_PUT' AND "uploadUrlExpiresAt" IS NOT NULL AND "confirmBy" >= "uploadUrlExpiresAt")
    OR ("uploadTransport" = 'MULTIPART' AND "uploadUrlExpiresAt" IS NULL AND isfinite("confirmBy"))
) IS TRUE);

ALTER TABLE "UploadOperation" ADD CONSTRAINT "UploadOperation_fingerprint_check" CHECK ((
    ("uploadTransport" = 'SINGLE_PUT' AND "requestFingerprint" ~ '^v1:[0-9a-f]{64}$')
    OR ("uploadTransport" = 'MULTIPART' AND "requestFingerprint" ~ '^v2:[0-9a-f]{64}$')
) IS TRUE);

ALTER TABLE "UploadOperation" ADD CONSTRAINT "UploadOperation_state_check" CHECK ((
    ("state"::text = 'OPEN' AND "closedAt" IS NULL AND "terminalErrorCode" IS NULL AND "reservationReleasedAt" IS NULL)
    OR ("state"::text = 'FINALIZED' AND "closedAt" IS NOT NULL AND "terminalErrorCode" IS NULL AND "reservationReleasedAt" IS NULL)
    OR ("state"::text = 'REJECTED' AND "closedAt" IS NOT NULL AND ("terminalErrorCode"::text IN ('FILE_TOO_LARGE', 'UPLOAD_VALIDATION_FAILED')
        OR ("uploadTransport" = 'MULTIPART' AND "terminalErrorCode"::text = 'TRANSFER_PARTS_INVALID')))
    OR ("state"::text = 'EXPIRED' AND "closedAt" IS NOT NULL AND "terminalErrorCode"::text = 'UPLOAD_EXPIRED')
    OR ("uploadTransport" = 'MULTIPART' AND "state"::text = 'CANCELLED' AND "closedAt" IS NOT NULL AND "terminalErrorCode"::text = 'UPLOAD_CANCELLED')
) IS TRUE);

ALTER TABLE "UploadOperation" ADD CONSTRAINT "UploadOperation_release_check" CHECK ((
    "reservationReleasedAt" IS NULL OR (
      "state"::text IN ('REJECTED', 'EXPIRED', 'CANCELLED') AND "closedAt" IS NOT NULL AND "writesClosedAt" IS NOT NULL
      AND "reservationReleasedAt" >= "closedAt" AND "reservationReleasedAt" >= "writesClosedAt")
) IS TRUE);

ALTER TABLE "ImportSession" ADD CONSTRAINT "ImportSession_identity_check" CHECK ((
    "idempotencyKey"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "requestFingerprint" ~ '^v1:[0-9a-f]{64}$' 
) IS TRUE);

ALTER TABLE "ImportSession" ADD CONSTRAINT "ImportSession_limits_check" CHECK ((
    "fileLimit" BETWEEN 1 AND 50 AND "acceptedFileCount" BETWEEN 0 AND "fileLimit"
    AND "nextOrdinal" = "acceptedFileCount" + 1
    AND "expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + interval '24 hours'
    AND "replayUntil" >= "expiresAt" + interval '24 hours' 
) IS TRUE);

ALTER TABLE "ImportSession" ADD CONSTRAINT "ImportSession_finite_times_check" CHECK ((
    isfinite("createdAt") AND
    isfinite("updatedAt") AND
    isfinite("expiresAt") AND
    isfinite("replayUntil")
) IS TRUE);

ALTER TABLE "ImportFile" ADD CONSTRAINT "ImportFile_identity_check" CHECK ((
    "uploadTransport" = 'MULTIPART' AND "ordinal" BETWEEN 1 AND 50
    AND "clientFileId"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND isfinite("createdAt")
) IS TRUE);

ALTER TABLE "MultipartTransfer" ADD CONSTRAINT "MultipartTransfer_geometry_check" CHECK ((
    "uploadTransport" = 'MULTIPART' AND "sizeBytes" BETWEEN 1 AND 104857600
    AND "partSizeBytes" BETWEEN 5242880 AND 16777216 AND "partSizeBytes" % 1048576 = 0
    AND "partCount" = ("sizeBytes" + "partSizeBytes" - 1) / "partSizeBytes"
    AND "contentSha256" ~ '^[0-9a-f]{64}$' 
) IS TRUE);

ALTER TABLE "MultipartTransfer" ADD CONSTRAINT "MultipartTransfer_identity_check" CHECK ((
    "providerNamespace" ~ '^[!-~]{1,255}$'
    AND ("providerUploadId" IS NULL OR ("providerUploadId" ~ '^[!-~]+$' AND length("providerUploadId") BETWEEN 1 AND 2048))
    AND "revision" >= 0 AND "fence" >= 0 AND "recoveryAttemptCount" >= 0 AND "cleanupAttemptCount" >= 0
    AND "expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + interval '24 hours'
    AND ("lastErrorCode" IS NULL OR "lastErrorCode" ~ '^[A-Z][A-Z0-9_]{1,99}$')
) IS TRUE);

ALTER TABLE "MultipartTransfer" ADD CONSTRAINT "MultipartTransfer_lease_check" CHECK ((
    ("leaseOwner" IS NULL AND "leaseUntil" IS NULL)
    OR ("leaseOwner" IS NOT NULL AND "leaseUntil" IS NOT NULL AND "leaseUntil" >= "createdAt" AND "fence" > 0)
) IS TRUE);

ALTER TABLE "MultipartTransfer" ADD CONSTRAINT "MultipartTransfer_manifest_check" CHECK ((
    ("manifestHash" IS NULL AND "manifestSealedAt" IS NULL)
    OR ("manifestHash" IS NOT NULL AND "manifestHash" ~ '^[0-9a-f]{64}$' AND "manifestSealedAt" IS NOT NULL AND "manifestSealedAt" >= "createdAt")
) IS TRUE);

ALTER TABLE "MultipartTransfer" ADD CONSTRAINT "MultipartTransfer_stored_check" CHECK ((
    (("storedAt" IS NULL AND "storedETag" IS NULL AND "storedVersionId" IS NULL)
      OR ("storedAt" IS NOT NULL AND "storedAt" >= "manifestSealedAt" AND "manifestSealedAt" IS NOT NULL
          AND "storedETag" IS NOT NULL AND length("storedETag") BETWEEN 1 AND 256))
    AND (("verifiedAt" IS NULL AND "verifiedSha256" IS NULL)
      OR ("verifiedAt" IS NOT NULL AND "storedAt" IS NOT NULL AND "verifiedAt" >= "storedAt" AND "verifiedSha256" = "contentSha256"))
) IS TRUE);

ALTER TABLE "MultipartTransfer" ADD CONSTRAINT "MultipartTransfer_state_shape_check" CHECK ((
    ("state" NOT IN ('CREATING', 'CREATE_UNKNOWN') OR "providerUploadId" IS NULL)
    AND ("state" NOT IN ('CREATING', 'CREATE_UNKNOWN', 'OPEN') OR "manifestSealedAt" IS NULL)
    AND ("state" NOT IN ('OPEN', 'SEALING', 'COMPLETING', 'COMPLETE_UNKNOWN', 'STORED', 'CONFIRMING', 'SUCCEEDED') OR "providerUploadId" IS NOT NULL)
    AND ("state" NOT IN ('COMPLETING', 'COMPLETE_UNKNOWN', 'STORED', 'CONFIRMING', 'SUCCEEDED') OR "manifestSealedAt" IS NOT NULL)
    AND ("state" NOT IN ('STORED', 'CONFIRMING', 'SUCCEEDED') OR "storedAt" IS NOT NULL)
    AND ("state" <> 'SUCCEEDED' OR "verifiedAt" IS NOT NULL)
) IS TRUE);

ALTER TABLE "MultipartTransfer" ADD CONSTRAINT "MultipartTransfer_cleanup_check" CHECK ((
    ("state" IN ('REJECTED', 'CANCELLED', 'EXPIRED') AND "publicationExcludedAt" IS NOT NULL
        AND "publicationExcludedAt" >= "createdAt" AND "cleanupState" <> 'NOT_REQUIRED' AND "leaseOwner" IS NULL)
    OR ("state" NOT IN ('REJECTED', 'CANCELLED', 'EXPIRED') AND "publicationExcludedAt" IS NULL
        AND "cleanupState" = 'NOT_REQUIRED' AND "writesClosedAt" IS NULL AND "objectAbsentAt" IS NULL AND "partsAbsentAt" IS NULL)
) IS TRUE);

ALTER TABLE "MultipartTransfer" ADD CONSTRAINT "MultipartTransfer_proof_check" CHECK ((
    (("writesClosedAt" IS NULL AND "closureEvidenceType" IS NULL AND "closureEvidenceRef" IS NULL)
      OR ("writesClosedAt" IS NOT NULL AND "publicationExcludedAt" IS NOT NULL AND "writesClosedAt" >= "publicationExcludedAt"
        AND "closureEvidenceType" IS NOT NULL AND "closureEvidenceType" <> 'unproven' AND length("closureEvidenceType") BETWEEN 1 AND 64
        AND "closureEvidenceRef" IS NOT NULL AND length("closureEvidenceRef") BETWEEN 1 AND 255))
    AND ("objectAbsentAt" IS NULL OR ("writesClosedAt" IS NOT NULL AND "objectAbsentAt" >= "writesClosedAt"))
    AND ("partsAbsentAt" IS NULL OR ("writesClosedAt" IS NOT NULL AND "partsAbsentAt" >= "writesClosedAt"))
    AND ("cleanupState" <> 'VERIFIED' OR ("writesClosedAt" IS NOT NULL AND "objectAbsentAt" IS NOT NULL AND "partsAbsentAt" IS NOT NULL))
) IS TRUE);

ALTER TABLE "MultipartTransfer" ADD CONSTRAINT "MultipartTransfer_finite_times_check" CHECK ((
    isfinite("createdAt") AND
    isfinite("updatedAt") AND
    isfinite("expiresAt") AND
    ("leaseUntil" IS NULL OR isfinite("leaseUntil")) AND
    ("recoveryAfter" IS NULL OR isfinite("recoveryAfter")) AND
    ("manifestSealedAt" IS NULL OR isfinite("manifestSealedAt")) AND
    ("storedAt" IS NULL OR isfinite("storedAt")) AND
    ("verifiedAt" IS NULL OR isfinite("verifiedAt")) AND
    ("publicationExcludedAt" IS NULL OR isfinite("publicationExcludedAt")) AND
    ("writesClosedAt" IS NULL OR isfinite("writesClosedAt")) AND
    ("objectAbsentAt" IS NULL OR isfinite("objectAbsentAt")) AND
    ("partsAbsentAt" IS NULL OR isfinite("partsAbsentAt")) AND
    ("cleanupRetryAfter" IS NULL OR isfinite("cleanupRetryAfter"))
) IS TRUE);

ALTER TABLE "MultipartPart" ADD CONSTRAINT "MultipartPart_shape_check" CHECK ((
    "partNumber" BETWEEN 1 AND 20 AND "expectedSizeBytes" BETWEEN 1 AND 16777216
    AND (("observedSizeBytes" IS NULL AND "observedETag" IS NULL AND "observedAt" IS NULL)
      OR ("observedSizeBytes" = "expectedSizeBytes" AND "observedETag" IS NOT NULL AND length("observedETag") > 0 AND "observedAt" IS NOT NULL))
    AND (("maxIssuedExpiresAt" IS NULL AND "lastIssuedRevision" IS NULL) OR ("maxIssuedExpiresAt" IS NOT NULL AND "lastIssuedRevision" >= 0))
) IS TRUE);

ALTER TABLE "MultipartPart" ADD CONSTRAINT "MultipartPart_finite_times_check" CHECK ((
    ("observedAt" IS NULL OR isfinite("observedAt")) AND
    ("maxIssuedExpiresAt" IS NULL OR isfinite("maxIssuedExpiresAt"))
) IS TRUE);

ALTER TABLE "MultipartManifestPart" ADD CONSTRAINT "MultipartManifestPart_shape_check" CHECK ((
    "partNumber" BETWEEN 1 AND 20 AND "sizeBytes" BETWEEN 1 AND 16777216 AND length("etag") > 0
) IS TRUE);

ALTER TABLE "MultipartIoOperation" ADD CONSTRAINT "MultipartIoOperation_shape_check" CHECK ((
    "attemptNo" >= 1 AND ("kind" <> 'CREATE' OR "attemptNo" = 1) AND "fence" >= 0
    AND ("lastErrorCode" IS NULL OR "lastErrorCode" ~ '^[A-Z][A-Z0-9_]{1,99}$')
    AND (("state" = 'INTENT' AND "startedAt" IS NULL AND "settledAt" IS NULL)
      OR ("state" IN ('DISPATCHED', 'UNKNOWN') AND "startedAt" IS NOT NULL AND "settledAt" IS NULL AND "fence" > 0)
      OR ("state" = 'SUCCEEDED' AND "startedAt" IS NOT NULL AND "settledAt" IS NOT NULL AND "fence" > 0)
      OR ("state" = 'FAILED' AND "settledAt" IS NOT NULL))
    AND ("startedAt" IS NULL OR "startedAt" >= "createdAt")
    AND ("settledAt" IS NULL OR "settledAt" >= COALESCE("startedAt", "createdAt"))
) IS TRUE);

ALTER TABLE "MultipartIoOperation" ADD CONSTRAINT "MultipartIoOperation_finite_times_check" CHECK ((
    isfinite("createdAt") AND
    ("startedAt" IS NULL OR isfinite("startedAt")) AND
    ("settledAt" IS NULL OR isfinite("settledAt"))
) IS TRUE);

-- Deferred graph validation allows one atomic init/finalization transaction without an intermediate invalid graph.
-- It does not change User counters or infer storage evidence.
CREATE FUNCTION cloudvault_multipart_graph_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fid uuid; r record;
BEGIN
    IF TG_OP='DELETE' THEN
        IF TG_TABLE_NAME='FileObject' THEN fid:=OLD.id; ELSE fid:=OLD."fileObjectId"; END IF;
    ELSE
        IF TG_TABLE_NAME='FileObject' THEN fid:=NEW.id; ELSE fid:=NEW."fileObjectId"; END IF;
    END IF;
    SELECT f."uploadTransport" AS mode, f.status, f."sizeBytes" AS file_size, f."confirmBy",
           o.id AS operation_id, o.state::text AS operation_state, o."replayUntil", o."reservationReleasedAt", o."writesClosedAt" AS op_closed,
           t.id AS transfer_id, t.state::text AS transfer_state, t."sizeBytes" AS transfer_size, t."expiresAt" AS transfer_expiry,
           t."manifestSealedAt", t."partCount", t."cleanupState", t."writesClosedAt", t."objectAbsentAt", t."partsAbsentAt", t."verifiedSha256", t."contentSha256",
           i.id AS item_id, i.ordinal, s."expiresAt" AS import_expiry, s."acceptedFileCount"
      INTO r FROM "FileObject" f LEFT JOIN "UploadOperation" o ON o."fileObjectId"=f.id
      LEFT JOIN "MultipartTransfer" t ON t."uploadOperationId"=o.id
      LEFT JOIN "ImportFile" i ON i.id=t."importFileId"
      LEFT JOIN "ImportSession" s ON s.id=i."importId" WHERE f.id=fid;
    IF NOT FOUND OR r.mode <> 'MULTIPART' THEN RETURN NULL; END IF;
    -- Pruned successful receipts remain compatible with ACTIVE confirm no-op.
    IF r.operation_id IS NULL AND r.status IN ('ACTIVE', 'SOFT_DELETED') THEN RETURN NULL; END IF;
    IF r.operation_id IS NULL OR r.transfer_id IS NULL OR r.item_id IS NULL
       OR r.file_size <> r.transfer_size OR r."confirmBy" <> r.transfer_expiry OR r.transfer_expiry <> r.import_expiry
       OR r."replayUntil" < r.import_expiry + interval '24 hours' OR r.ordinal > r."acceptedFileCount" THEN
        RAISE EXCEPTION 'Incomplete or inconsistent multipart identity/geometry/deadline graph' USING ERRCODE='23514';
    END IF;
    IF NOT ((r.operation_state='OPEN' AND r.transfer_state IN ('CREATING','CREATE_UNKNOWN','OPEN','SEALING','COMPLETING','COMPLETE_UNKNOWN','STORED','CONFIRMING') AND r.status='PENDING_UPLOAD')
        OR (r.operation_state='FINALIZED' AND r.transfer_state='SUCCEEDED' AND r.status IN ('ACTIVE','SOFT_DELETED'))
        OR (r.operation_state IN ('REJECTED','CANCELLED','EXPIRED') AND r.operation_state=r.transfer_state AND r.status='PENDING_UPLOAD')) THEN
        RAISE EXCEPTION 'Inconsistent multipart terminal/accounting state' USING ERRCODE='23514';
    END IF;
    IF r."manifestSealedAt" IS NOT NULL AND (
        (SELECT count(*) FROM "MultipartManifestPart" WHERE "transferId"=r.transfer_id)<>r."partCount"
        OR (SELECT COALESCE(sum("sizeBytes"),0) FROM "MultipartManifestPart" WHERE "transferId"=r.transfer_id)<>r.transfer_size) THEN
        RAISE EXCEPTION 'Incomplete sealed multipart manifest' USING ERRCODE='23514';
    END IF;
    IF r.op_closed IS NOT NULL AND r.op_closed IS DISTINCT FROM r."writesClosedAt" THEN
        RAISE EXCEPTION 'Operation closure marker requires transfer-specific evidence' USING ERRCODE='23514';
    END IF;
    IF r."reservationReleasedAt" IS NOT NULL AND (
        r."cleanupState" <> 'VERIFIED' OR r.op_closed IS DISTINCT FROM r."writesClosedAt"
        OR r."objectAbsentAt" IS NULL OR r."partsAbsentAt" IS NULL
        OR r."reservationReleasedAt" < GREATEST(r."objectAbsentAt",r."partsAbsentAt")
        OR EXISTS (SELECT 1 FROM "MultipartIoOperation" WHERE "transferId"=r.transfer_id AND state IN ('INTENT','DISPATCHED','UNKNOWN'))) THEN
        RAISE EXCEPTION 'Multipart reservation requires closed I/O and verified object AND part cleanup' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "FileObject_multipart_graph_check" AFTER INSERT OR UPDATE ON "FileObject" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_graph_check();
CREATE CONSTRAINT TRIGGER "UploadOperation_multipart_graph_check" AFTER INSERT OR UPDATE OR DELETE ON "UploadOperation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_graph_check();
CREATE CONSTRAINT TRIGGER "ImportFile_multipart_graph_check" AFTER INSERT OR UPDATE OR DELETE ON "ImportFile" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_graph_check();
CREATE CONSTRAINT TRIGGER "MultipartTransfer_graph_check" AFTER INSERT OR UPDATE OR DELETE ON "MultipartTransfer" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_graph_check();

CREATE FUNCTION cloudvault_multipart_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME='FileObject' THEN
        IF NEW."uploadTransport" IS DISTINCT FROM OLD."uploadTransport" THEN
            RAISE EXCEPTION 'Upload transport is immutable' USING ERRCODE='23514';
        END IF;
        IF OLD."uploadTransport"='MULTIPART' AND
           (NEW.id,NEW."ownerId",NEW."storageKey",NEW."sizeBytes",NEW."mimeType",NEW."originalName",NEW."confirmBy",NEW."createdAt") IS DISTINCT FROM
           (OLD.id,OLD."ownerId",OLD."storageKey",OLD."sizeBytes",OLD."mimeType",OLD."originalName",OLD."confirmBy",OLD."createdAt") THEN
            RAISE EXCEPTION 'Multipart file identity is immutable' USING ERRCODE='23514';
        END IF;
    ELSIF TG_TABLE_NAME='UploadOperation' AND OLD."uploadTransport"='MULTIPART' THEN
        IF (NEW.id,NEW."ownerId",NEW."fileObjectId",NEW."uploadTransport",NEW."idempotencyKey",NEW."requestFingerprint",NEW."createdAt",NEW."replayUntil") IS DISTINCT FROM
           (OLD.id,OLD."ownerId",OLD."fileObjectId",OLD."uploadTransport",OLD."idempotencyKey",OLD."requestFingerprint",OLD."createdAt",OLD."replayUntil")
           OR (OLD.state::text<>'OPEN' AND NEW.state IS DISTINCT FROM OLD.state)
           OR (OLD."closedAt" IS NOT NULL AND NEW."closedAt" IS DISTINCT FROM OLD."closedAt")
           OR (OLD."terminalErrorCode" IS NOT NULL AND NEW."terminalErrorCode" IS DISTINCT FROM OLD."terminalErrorCode")
           OR (OLD."reservationReleasedAt" IS NOT NULL AND NEW."reservationReleasedAt" IS DISTINCT FROM OLD."reservationReleasedAt") THEN
            RAISE EXCEPTION 'Multipart receipt/terminal accounting identity is immutable' USING ERRCODE='23514';
        END IF;
    ELSIF TG_TABLE_NAME='MultipartTransfer' THEN
        IF (NEW.id,NEW."importFileId",NEW."uploadOperationId",NEW."fileObjectId",NEW."ownerId",NEW."uploadTransport",NEW."sizeBytes",NEW."partSizeBytes",NEW."partCount",NEW."contentSha256",NEW."providerNamespace",NEW."expiresAt",NEW."createdAt") IS DISTINCT FROM
           (OLD.id,OLD."importFileId",OLD."uploadOperationId",OLD."fileObjectId",OLD."ownerId",OLD."uploadTransport",OLD."sizeBytes",OLD."partSizeBytes",OLD."partCount",OLD."contentSha256",OLD."providerNamespace",OLD."expiresAt",OLD."createdAt")
           OR NEW.revision<OLD.revision OR NEW.fence<OLD.fence
           OR (OLD."providerUploadId" IS NOT NULL AND NEW."providerUploadId" IS DISTINCT FROM OLD."providerUploadId")
           OR (OLD."manifestSealedAt" IS NOT NULL AND (NEW."manifestSealedAt",NEW."manifestHash") IS DISTINCT FROM (OLD."manifestSealedAt",OLD."manifestHash"))
           OR (OLD.state IN ('SUCCEEDED','REJECTED','CANCELLED','EXPIRED') AND NEW.state IS DISTINCT FROM OLD.state)
           OR (OLD."publicationExcludedAt" IS NOT NULL AND NEW."publicationExcludedAt" IS DISTINCT FROM OLD."publicationExcludedAt") THEN
            RAISE EXCEPTION 'Multipart transfer identity/fence/terminal decision is immutable' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER "FileObject_transport_guard" BEFORE UPDATE ON "FileObject" FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_identity_guard();
CREATE TRIGGER "UploadOperation_multipart_identity_guard" BEFORE UPDATE ON "UploadOperation" FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_identity_guard();
CREATE TRIGGER "MultipartTransfer_identity_guard" BEFORE UPDATE ON "MultipartTransfer" FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_identity_guard();

CREATE FUNCTION cloudvault_multipart_part_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t "MultipartTransfer"; expected integer;
BEGIN
    SELECT * INTO STRICT t FROM "MultipartTransfer" WHERE id=NEW."transferId" FOR SHARE;
    IF NEW."partNumber"<1 OR NEW."partNumber">t."partCount"  THEN
        RAISE EXCEPTION 'Part outside fixed multipart geometry' USING ERRCODE='23514';
    END IF;
    expected := LEAST(t."partSizeBytes"::bigint,t."sizeBytes"-(NEW."partNumber"-1)::bigint*t."partSizeBytes")::integer;
    IF TG_OP='UPDATE' AND (NEW."transferId",NEW."partNumber") IS DISTINCT FROM (OLD."transferId",OLD."partNumber") THEN
        RAISE EXCEPTION 'Part ownership and ordinal are immutable' USING ERRCODE='23514';
    END IF;
    IF TG_TABLE_NAME='MultipartManifestPart' THEN
        IF NEW."sizeBytes"<>expected OR t."manifestSealedAt" IS NOT NULL OR t.state<>'SEALING' THEN
            RAISE EXCEPTION 'Manifest is sealed or not eligible' USING ERRCODE='23514';
        END IF;
    ELSE
        IF NEW."expectedSizeBytes"<>expected THEN RAISE EXCEPTION 'Incorrect expected part size' USING ERRCODE='23514'; END IF;
        IF NEW."maxIssuedExpiresAt" IS NOT NULL AND (NEW."maxIssuedExpiresAt">t."expiresAt" OR NEW."maxIssuedExpiresAt"<t."createdAt" OR NEW."lastIssuedRevision">t.revision) THEN
            RAISE EXCEPTION 'Part grant exceeds transfer authority' USING ERRCODE='23514';
        END IF;
        IF TG_OP='UPDATE' AND (NEW."transferId",NEW."partNumber",NEW."expectedSizeBytes") IS DISTINCT FROM (OLD."transferId",OLD."partNumber",OLD."expectedSizeBytes") THEN
            RAISE EXCEPTION 'Part identity is immutable' USING ERRCODE='23514';
        END IF;
        IF TG_OP='UPDATE' AND OLD."maxIssuedExpiresAt" IS NOT NULL AND (NEW."maxIssuedExpiresAt" IS NULL OR NEW."maxIssuedExpiresAt"<OLD."maxIssuedExpiresAt" OR NEW."lastIssuedRevision"<OLD."lastIssuedRevision") THEN
            RAISE EXCEPTION 'Cannot forget an issued grant' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER "MultipartPart_geometry_guard" BEFORE INSERT OR UPDATE ON "MultipartPart" FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_part_guard();
CREATE TRIGGER "MultipartManifestPart_geometry_guard" BEFORE INSERT OR UPDATE ON "MultipartManifestPart" FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_part_guard();

CREATE FUNCTION cloudvault_multipart_manifest_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."manifestSealedAt" IS NOT NULL AND OLD."manifestSealedAt" IS NULL AND
       ((SELECT count(*) FROM "MultipartManifestPart" WHERE "transferId"=NEW.id)<>NEW."partCount"
        OR (SELECT COALESCE(sum("sizeBytes"),0) FROM "MultipartManifestPart" WHERE "transferId"=NEW.id)<>NEW."sizeBytes") THEN
        RAISE EXCEPTION 'Cannot seal incomplete multipart manifest' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER "MultipartTransfer_manifest_check" BEFORE UPDATE ON "MultipartTransfer" FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_manifest_check();


-- Immutable receipt identities and no early deletion of recovery/accounting evidence.
CREATE FUNCTION cloudvault_multipart_aux_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME='ImportSession' THEN
        IF (NEW.id,NEW."ownerId",NEW."idempotencyKey",NEW."requestFingerprint",NEW."expiresAt",NEW."replayUntil",NEW."fileLimit",NEW."createdAt") IS DISTINCT FROM
           (OLD.id,OLD."ownerId",OLD."idempotencyKey",OLD."requestFingerprint",OLD."expiresAt",OLD."replayUntil",OLD."fileLimit",OLD."createdAt")
           OR NEW."acceptedFileCount"<OLD."acceptedFileCount" OR (OLD.state='EXPIRED' AND NEW.state<>'EXPIRED') THEN
            RAISE EXCEPTION 'Immutable import identity/retention' USING ERRCODE='23514';
        END IF;
    ELSIF TG_TABLE_NAME='ImportFile' THEN
        IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Import item identity is immutable' USING ERRCODE='23514'; END IF;
    ELSIF TG_TABLE_NAME='MultipartIoOperation' THEN
        IF (NEW.id,NEW."transferId",NEW.kind,NEW."attemptNo",NEW.fence,NEW."createdAt") IS DISTINCT FROM
           (OLD.id,OLD."transferId",OLD.kind,OLD."attemptNo",OLD.fence,OLD."createdAt")
           OR (OLD.state IN ('SUCCEEDED','FAILED') AND NEW.state IS DISTINCT FROM OLD.state)
           OR (OLD."startedAt" IS NOT NULL AND NEW."startedAt" IS DISTINCT FROM OLD."startedAt")
           OR (OLD."settledAt" IS NOT NULL AND NEW."settledAt" IS DISTINCT FROM OLD."settledAt") THEN
            RAISE EXCEPTION 'I/O identity or known outcome cannot be reset' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER "ImportSession_identity_guard" BEFORE UPDATE ON "ImportSession" FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_aux_guard();
CREATE TRIGGER "ImportFile_identity_guard" BEFORE UPDATE ON "ImportFile" FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_aux_guard();
CREATE TRIGGER "MultipartIoOperation_identity_guard" BEFORE UPDATE ON "MultipartIoOperation" FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_aux_guard();

CREATE FUNCTION cloudvault_multipart_retention_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op "UploadOperation"; tid uuid;
BEGIN
    IF TG_TABLE_NAME='ImportSession' THEN
        IF CURRENT_TIMESTAMP<OLD."replayUntil" THEN RAISE EXCEPTION 'Import receipt is retained' USING ERRCODE='23514'; END IF;
        RETURN OLD;
    ELSIF TG_TABLE_NAME='UploadOperation' THEN
        IF OLD."uploadTransport"='SINGLE_PUT' THEN RETURN OLD; END IF;
        op:=OLD;
    ELSIF TG_TABLE_NAME='ImportFile' THEN
        SELECT * INTO op FROM "UploadOperation" WHERE "fileObjectId"=OLD."fileObjectId";
        IF NOT FOUND THEN
            IF EXISTS (SELECT 1 FROM "ImportSession" s JOIN "FileObject" f ON f.id=OLD."fileObjectId"
                       WHERE s.id=OLD."importId" AND CURRENT_TIMESTAMP>=s."replayUntil" AND f.status IN ('ACTIVE','SOFT_DELETED')) THEN RETURN OLD; END IF;
            RAISE EXCEPTION 'Unresolved import item cannot be removed' USING ERRCODE='23514';
        END IF;
    ELSE
        IF TG_TABLE_NAME='MultipartTransfer' THEN tid:=OLD.id; ELSE tid:=OLD."transferId"; END IF;
        SELECT o.* INTO op FROM "UploadOperation" o JOIN "MultipartTransfer" t ON t."uploadOperationId"=o.id WHERE t.id=tid;
    END IF;
    IF op.id IS NULL OR CURRENT_TIMESTAMP<op."replayUntil" OR (op.state::text<>'FINALIZED' AND op."reservationReleasedAt" IS NULL)
       OR EXISTS (SELECT 1 FROM "MultipartIoOperation" io JOIN "MultipartTransfer" t ON t.id=io."transferId"
                  WHERE t."uploadOperationId"=op.id AND io.state IN ('INTENT','DISPATCHED','UNKNOWN')) THEN
        RAISE EXCEPTION 'Unfinished multipart identity/accounting evidence is retained' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
END $$;
CREATE TRIGGER "ImportSession_retention_guard" BEFORE DELETE ON "ImportSession" FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_retention_guard();
CREATE TRIGGER "ImportFile_retention_guard" BEFORE DELETE ON "ImportFile" FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_retention_guard();
CREATE TRIGGER "UploadOperation_multipart_retention_guard" BEFORE DELETE ON "UploadOperation" FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_retention_guard();
CREATE TRIGGER "MultipartTransfer_retention_guard" BEFORE DELETE ON "MultipartTransfer" FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_retention_guard();
CREATE TRIGGER "MultipartPart_retention_guard" BEFORE DELETE ON "MultipartPart" FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_retention_guard();
CREATE TRIGGER "MultipartManifestPart_retention_guard" BEFORE DELETE ON "MultipartManifestPart" FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_retention_guard();
CREATE TRIGGER "MultipartIoOperation_retention_guard" BEFORE DELETE ON "MultipartIoOperation" FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_retention_guard();


CREATE FUNCTION cloudvault_multipart_manifest_graph_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid uuid; t "MultipartTransfer";
BEGIN
    IF TG_OP='DELETE' THEN tid:=OLD."transferId"; ELSE tid:=NEW."transferId"; END IF;
    SELECT * INTO t FROM "MultipartTransfer" WHERE id=tid;
    IF FOUND AND t."manifestSealedAt" IS NOT NULL AND (
        (SELECT count(*) FROM "MultipartManifestPart" WHERE "transferId"=tid)<>t."partCount"
        OR (SELECT COALESCE(sum("sizeBytes"),0) FROM "MultipartManifestPart" WHERE "transferId"=tid)<>t."sizeBytes") THEN
        RAISE EXCEPTION 'Sealed manifest cannot lose parts' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "MultipartManifestPart_graph_check" AFTER INSERT OR UPDATE OR DELETE ON "MultipartManifestPart" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cloudvault_multipart_manifest_graph_check();

COMMIT;

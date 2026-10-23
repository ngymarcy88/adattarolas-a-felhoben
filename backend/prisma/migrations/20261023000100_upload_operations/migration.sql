BEGIN;

-- Prevent legacy writes racing the preflight. No invented keys, receipt backfill or quota release.
LOCK TABLE "User", "FileObject" IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "FileObject" WHERE "status" = 'PENDING_UPLOAD')
       OR EXISTS (SELECT 1 FROM "User" WHERE "reservedStorageBytes" <> 0) THEN
        RAISE EXCEPTION 'Upload migration requires explicit reconciliation of legacy pending uploads/reservations; no data was changed.';
    END IF;
END $$;

CREATE TYPE "UploadOperationState" AS ENUM ('OPEN', 'FINALIZED', 'REJECTED', 'EXPIRED');
CREATE TYPE "UploadTerminalErrorCode" AS ENUM ('FILE_TOO_LARGE', 'UPLOAD_VALIDATION_FAILED', 'UPLOAD_EXPIRED');

CREATE TABLE "UploadOperation" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "fileObjectId" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "requestFingerprint" VARCHAR(67) NOT NULL,
    "state" "UploadOperationState" NOT NULL DEFAULT 'OPEN',
    "terminalErrorCode" "UploadTerminalErrorCode",
    "closedAt" TIMESTAMPTZ(3),
    "reservationReleasedAt" TIMESTAMPTZ(3),
    "writesClosedAt" TIMESTAMPTZ(3),
    "replayUntil" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "UploadOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UploadOperation_idempotency_key_check" CHECK (
        "idempotencyKey"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
    CONSTRAINT "UploadOperation_fingerprint_check" CHECK (
        "requestFingerprint" ~ '^v1:[0-9a-f]{64}$'
    ),
    CONSTRAINT "UploadOperation_state_check" CHECK (
        ("state" = 'OPEN' AND "closedAt" IS NULL AND "terminalErrorCode" IS NULL AND "reservationReleasedAt" IS NULL)
        OR ("state" = 'FINALIZED' AND "closedAt" IS NOT NULL AND "terminalErrorCode" IS NULL AND "reservationReleasedAt" IS NULL)
        OR ("state" = 'REJECTED' AND "closedAt" IS NOT NULL AND "terminalErrorCode" IS NOT NULL
            AND "terminalErrorCode" IN ('FILE_TOO_LARGE', 'UPLOAD_VALIDATION_FAILED'))
        OR ("state" = 'EXPIRED' AND "closedAt" IS NOT NULL AND "terminalErrorCode" IS NOT NULL
            AND "terminalErrorCode" = 'UPLOAD_EXPIRED')
    ),
    CONSTRAINT "UploadOperation_release_check" CHECK (
        "reservationReleasedAt" IS NULL OR (
            "state" IN ('REJECTED', 'EXPIRED') AND "closedAt" IS NOT NULL AND "writesClosedAt" IS NOT NULL
            AND "reservationReleasedAt" >= "closedAt" AND "reservationReleasedAt" >= "writesClosedAt"
        )
    ),
    CONSTRAINT "UploadOperation_finite_timestamps_check" CHECK (
        isfinite("createdAt") AND isfinite("updatedAt") AND isfinite("replayUntil")
        AND ("closedAt" IS NULL OR isfinite("closedAt"))
        AND ("writesClosedAt" IS NULL OR isfinite("writesClosedAt"))
        AND ("reservationReleasedAt" IS NULL OR isfinite("reservationReleasedAt"))
    ),
    CONSTRAINT "UploadOperation_timestamps_check" CHECK (
        ("closedAt" IS NULL OR "closedAt" >= "createdAt")
        AND ("writesClosedAt" IS NULL OR "writesClosedAt" >= "createdAt")
        AND "replayUntil" >= "createdAt" + INTERVAL '24 hours'
    )
);

CREATE UNIQUE INDEX "UploadOperation_fileObjectId_key" ON "UploadOperation"("fileObjectId");
CREATE UNIQUE INDEX "UploadOperation_fileObjectId_ownerId_key" ON "UploadOperation"("fileObjectId", "ownerId");
CREATE UNIQUE INDEX "UploadOperation_ownerId_idempotencyKey_key" ON "UploadOperation"("ownerId", "idempotencyKey");
CREATE INDEX "UploadOperation_state_replayUntil_idx" ON "UploadOperation"("state", "replayUntil");
CREATE INDEX "UploadOperation_state_reservationReleasedAt_idx" ON "UploadOperation"("state", "reservationReleasedAt");
CREATE INDEX "FileObject_status_cleanupRetryAfter_idx" ON "FileObject"("status", "cleanupRetryAfter");

ALTER TABLE "UploadOperation" ADD CONSTRAINT "UploadOperation_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UploadOperation" ADD CONSTRAINT "UploadOperation_fileObjectId_ownerId_fkey"
    FOREIGN KEY ("fileObjectId", "ownerId") REFERENCES "FileObject"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;

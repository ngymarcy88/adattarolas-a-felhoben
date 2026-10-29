BEGIN;

-- Additive only: no legacy backfill, no User/FileObject/UploadOperation writes or counter reset.
-- CHECK (... IS TRUE) rejects SQL UNKNOWN as well as FALSE on nullable state fields.
-- Cross-row publication, immutable transitions and quota sums require future service transactions.

-- CreateEnum
CREATE TYPE "ProcessingJobState" AS ENUM ('QUEUED', 'RUNNING', 'RETRY_WAIT', 'BLOCKED_QUOTA', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProcessingAttemptPhase" AS ENUM ('PREPARING', 'WRITE_PENDING', 'STORED', 'PUBLISHED', 'ORPHANED', 'CLEANUP_BLOCKED', 'RELEASED');

-- CreateEnum
CREATE TYPE "DerivedObjectKind" AS ENUM ('THUMBNAIL');

-- CreateEnum
CREATE TYPE "DerivedObjectState" AS ENUM ('READY', 'RETIRED', 'PURGED');

-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "fileObjectId" UUID NOT NULL,
    "processorKey" VARCHAR(64) NOT NULL,
    "processorVersion" VARCHAR(32) NOT NULL,
    "implementationFingerprint" CHAR(64) NOT NULL,
    "sourceFingerprint" CHAR(64) NOT NULL,
    "state" "ProcessingJobState" NOT NULL DEFAULT 'QUEUED',
    "leaseOwner" UUID,
    "leaseUntil" TIMESTAMPTZ(3),
    "fence" BIGINT NOT NULL DEFAULT 0,
    "cycleAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "totalAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "recoveryProbeCount" INTEGER NOT NULL DEFAULT 0,
    "retryRevision" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3),
    "lastErrorCode" VARCHAR(100),
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingAttempt" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "fileObjectId" UUID NOT NULL,
    "fence" BIGINT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "phase" "ProcessingAttemptPhase" NOT NULL DEFAULT 'PREPARING',
    "sourceSha256" CHAR(64),
    "sourceETag" VARCHAR(256),
    "candidateKey" VARCHAR(1024) NOT NULL,
    "outputSha256" CHAR(64),
    "mimeType" VARCHAR(100),
    "width" INTEGER,
    "height" INTEGER,
    "outputBytes" BIGINT,
    "reservedBytes" BIGINT NOT NULL DEFAULT 0,
    "writeStartedAt" TIMESTAMPTZ(3),
    "writeSettledAt" TIMESTAMPTZ(3),
    "writesClosedAt" TIMESTAMPTZ(3),
    "closureEvidenceType" VARCHAR(64),
    "closureEvidenceRef" VARCHAR(255),
    "objectAbsentAt" TIMESTAMPTZ(3),
    "reservationReleasedAt" TIMESTAMPTZ(3),
    "finalizedAt" TIMESTAMPTZ(3),
    "cleanupRetryAfter" TIMESTAMPTZ(3),
    "cleanupAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProcessingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DerivedObject" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "fileObjectId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "kind" "DerivedObjectKind" NOT NULL DEFAULT 'THUMBNAIL',
    "processorVersion" VARCHAR(32) NOT NULL,
    "sourceFingerprint" CHAR(64) NOT NULL,
    "sourceSha256" CHAR(64) NOT NULL,
    "implementationFingerprint" CHAR(64) NOT NULL,
    "publicationFence" BIGINT NOT NULL,
    "storageKey" VARCHAR(1024) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "state" "DerivedObjectState" NOT NULL DEFAULT 'READY',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DerivedObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessingJob_state_nextAttemptAt_idx" ON "ProcessingJob"("state", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ProcessingJob_state_leaseUntil_idx" ON "ProcessingJob"("state", "leaseUntil");

-- CreateIndex
CREATE INDEX "ProcessingJob_ownerId_fileObjectId_idx" ON "ProcessingJob"("ownerId", "fileObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingJob_logical_identity_key" ON "ProcessingJob"("ownerId", "fileObjectId", "processorKey", "processorVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingJob_ownership_key" ON "ProcessingJob"("id", "ownerId", "fileObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingAttempt_candidateKey_key" ON "ProcessingAttempt"("candidateKey");

-- CreateIndex
CREATE INDEX "ProcessingAttempt_phase_cleanupRetryAfter_idx" ON "ProcessingAttempt"("phase", "cleanupRetryAfter");

-- CreateIndex
CREATE INDEX "ProcessingAttempt_jobId_phase_idx" ON "ProcessingAttempt"("jobId", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingAttempt_jobId_ordinal_key" ON "ProcessingAttempt"("jobId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingAttempt_result_identity_key" ON "ProcessingAttempt"("id", "jobId", "ownerId", "fileObjectId", "candidateKey");

-- CreateIndex
CREATE UNIQUE INDEX "DerivedObject_attemptId_key" ON "DerivedObject"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "DerivedObject_storageKey_key" ON "DerivedObject"("storageKey");

-- CreateIndex
CREATE INDEX "DerivedObject_ownerId_fileObjectId_idx" ON "DerivedObject"("ownerId", "fileObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "DerivedObject_attempt_identity_key" ON "DerivedObject"("attemptId", "jobId", "ownerId", "fileObjectId", "storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "DerivedObject_jobId_kind_key" ON "DerivedObject"("jobId", "kind");

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_fileObjectId_ownerId_fkey" FOREIGN KEY ("fileObjectId", "ownerId") REFERENCES "FileObject"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingAttempt" ADD CONSTRAINT "ProcessingAttempt_jobId_ownerId_fileObjectId_fkey" FOREIGN KEY ("jobId", "ownerId", "fileObjectId") REFERENCES "ProcessingJob"("id", "ownerId", "fileObjectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DerivedObject" ADD CONSTRAINT "DerivedObject_fileObjectId_ownerId_fkey" FOREIGN KEY ("fileObjectId", "ownerId") REFERENCES "FileObject"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DerivedObject" ADD CONSTRAINT "DerivedObject_jobId_ownerId_fileObjectId_fkey" FOREIGN KEY ("jobId", "ownerId", "fileObjectId") REFERENCES "ProcessingJob"("id", "ownerId", "fileObjectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DerivedObject" ADD CONSTRAINT "DerivedObject_attemptId_jobId_ownerId_fileObjectId_storage_fkey" FOREIGN KEY ("attemptId", "jobId", "ownerId", "fileObjectId", "storageKey") REFERENCES "ProcessingAttempt"("id", "jobId", "ownerId", "fileObjectId", "candidateKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Additional PostgreSQL row invariants not expressible in Prisma DSL.

ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_identity_check" CHECK ((
    "processorKey" ~ '^[a-z][a-z0-9-]{0,63}$'
    AND "processorVersion" ~ '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'
    AND "implementationFingerprint" ~ '^[0-9a-f]{64}$' AND "sourceFingerprint" ~ '^[0-9a-f]{64}$'
    AND ("lastErrorCode" IS NULL OR "lastErrorCode" ~ '^[A-Z][A-Z0-9_]{0,99}$')
) IS TRUE);

ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_counters_check" CHECK ((
    "fence" >= 0 AND "retryRevision" BETWEEN 0 AND 2
    AND "cycleAttemptCount" BETWEEN 0 AND 3 AND "recoveryProbeCount" BETWEEN 0 AND 3
    AND "totalAttemptCount" BETWEEN 0 AND 9 AND "cycleAttemptCount" <= "totalAttemptCount"
    AND "totalAttemptCount" <= 3 * ("retryRevision" + 1)
    AND "fence" >= "totalAttemptCount"
    AND (NOT "retryable" OR ("retryRevision" < 2 AND "state" IN ('FAILED', 'BLOCKED_QUOTA', 'CANCELLED')))
) IS TRUE);

ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_state_check" CHECK ((
    ("state" = 'RUNNING' AND "leaseOwner" IS NOT NULL AND "leaseUntil" IS NOT NULL
        AND "fence" > 0 AND "finishedAt" IS NULL AND "nextAttemptAt" IS NULL AND "lastErrorCode" IS NULL AND NOT "retryable")
    OR ("state" <> 'RUNNING' AND "leaseOwner" IS NULL AND "leaseUntil" IS NULL AND (
        ("state" = 'QUEUED' AND "finishedAt" IS NULL AND "nextAttemptAt" IS NULL AND "lastErrorCode" IS NULL AND NOT "retryable")
        OR ("state" = 'RETRY_WAIT' AND "finishedAt" IS NULL AND "nextAttemptAt" IS NOT NULL AND "lastErrorCode" IS NOT NULL AND NOT "retryable")
        OR ("state" = 'BLOCKED_QUOTA' AND "finishedAt" IS NULL AND "nextAttemptAt" IS NULL AND "lastErrorCode" IS NOT NULL AND "lastErrorCode" = 'DERIVED_QUOTA_EXCEEDED')
        OR ("state" = 'SUCCEEDED' AND "finishedAt" IS NOT NULL AND "nextAttemptAt" IS NULL AND "lastErrorCode" IS NULL AND NOT "retryable")
        OR ("state" = 'FAILED' AND "finishedAt" IS NOT NULL AND "nextAttemptAt" IS NULL AND "lastErrorCode" IS NOT NULL)
        OR ("state" = 'CANCELLED' AND "finishedAt" IS NOT NULL AND "nextAttemptAt" IS NULL AND "lastErrorCode" IS NOT NULL AND "lastErrorCode" = 'SOURCE_NOT_ACTIVE')
    ))
) IS TRUE);

ALTER TABLE "ProcessingAttempt" ADD CONSTRAINT "ProcessingAttempt_identity_check" CHECK ((
    "ordinal" BETWEEN 1 AND 9 AND "fence" > 0 AND "cleanupAttemptCount" >= 0
    AND "candidateKey" = 'derived/' || "ownerId"::text || '/' || "fileObjectId"::text || '/' || "jobId"::text || '/' || "id"::text || '.webp'
    AND (("sourceSha256" IS NULL AND "sourceETag" IS NULL)
        OR ("sourceSha256" IS NOT NULL AND "sourceETag" IS NOT NULL
            AND "sourceSha256" ~ '^[0-9a-f]{64}$' AND length("sourceETag") > 0 AND "sourceETag" !~ '[[:cntrl:]]'))
) IS TRUE);

ALTER TABLE "ProcessingAttempt" ADD CONSTRAINT "ProcessingAttempt_output_check" CHECK ((
    ("outputSha256" IS NULL AND "mimeType" IS NULL AND "width" IS NULL AND "height" IS NULL AND "outputBytes" IS NULL)
    OR ("outputSha256" IS NOT NULL AND "mimeType" IS NOT NULL AND "width" IS NOT NULL AND "height" IS NOT NULL AND "outputBytes" IS NOT NULL
        AND "sourceSha256" IS NOT NULL AND "sourceETag" IS NOT NULL
        AND "outputSha256" ~ '^[0-9a-f]{64}$' AND "mimeType" = 'image/webp'
        AND "width" BETWEEN 1 AND 512 AND "height" BETWEEN 1 AND 512 AND "outputBytes" BETWEEN 1 AND 524288)
) IS TRUE);

ALTER TABLE "ProcessingAttempt" ADD CONSTRAINT "ProcessingAttempt_proof_check" CHECK ((
    (("writesClosedAt" IS NULL AND "closureEvidenceType" IS NULL AND "closureEvidenceRef" IS NULL)
        OR ("writesClosedAt" IS NOT NULL AND "closureEvidenceType" IS NOT NULL AND "closureEvidenceRef" IS NOT NULL
            AND "closureEvidenceType" ~ '^[A-Z][A-Z0-9_]{0,63}$'
            AND "closureEvidenceRef" ~ '^[A-Za-z0-9_.:-]{1,255}$'))
    AND ("objectAbsentAt" IS NULL OR ("writesClosedAt" IS NOT NULL AND "objectAbsentAt" >= "writesClosedAt"))
    AND ("finalizedAt" IS NULL OR "reservationReleasedAt" IS NULL)
) IS TRUE);

ALTER TABLE "ProcessingAttempt" ADD CONSTRAINT "ProcessingAttempt_state_check" CHECK ((
    ("phase" = 'PREPARING' AND "reservedBytes" = 0 AND "outputBytes" IS NULL
        AND "writeStartedAt" IS NULL AND "writeSettledAt" IS NULL AND "writesClosedAt" IS NULL
        AND "objectAbsentAt" IS NULL AND "reservationReleasedAt" IS NULL AND "finalizedAt" IS NULL AND "cleanupRetryAfter" IS NULL)
    OR ("phase" IN ('WRITE_PENDING', 'STORED', 'PUBLISHED', 'ORPHANED', 'CLEANUP_BLOCKED')
        AND "outputBytes" IS NOT NULL AND "reservedBytes" = "outputBytes" AND "reservedBytes" BETWEEN 1 AND 524288
        AND "writeStartedAt" IS NOT NULL AND "reservationReleasedAt" IS NULL
        AND ("phase" <> 'STORED' OR "writeSettledAt" IS NOT NULL)
        AND (("phase" = 'PUBLISHED' AND "finalizedAt" IS NOT NULL AND "objectAbsentAt" IS NULL AND "cleanupRetryAfter" IS NULL)
            OR ("phase" <> 'PUBLISHED' AND "finalizedAt" IS NULL))
        AND ("phase" IN ('ORPHANED', 'CLEANUP_BLOCKED') OR "objectAbsentAt" IS NULL)
        AND ("phase" IN ('ORPHANED', 'CLEANUP_BLOCKED') OR "cleanupRetryAfter" IS NULL))
    OR ("phase" = 'RELEASED' AND "reservationReleasedAt" IS NOT NULL AND "finalizedAt" IS NULL AND "cleanupRetryAfter" IS NULL AND (
        ("reservedBytes" = 0 AND "outputBytes" IS NULL AND "writeStartedAt" IS NULL AND "writeSettledAt" IS NULL
            AND "writesClosedAt" IS NULL AND "objectAbsentAt" IS NULL)
        OR ("reservedBytes" BETWEEN 1 AND 524288 AND "outputBytes" IS NOT NULL AND "reservedBytes" = "outputBytes"
            AND "writeStartedAt" IS NOT NULL AND "writesClosedAt" IS NOT NULL AND "objectAbsentAt" IS NOT NULL
            AND "reservationReleasedAt" >= "objectAbsentAt")
    ))
) IS TRUE);

ALTER TABLE "DerivedObject" ADD CONSTRAINT "DerivedObject_output_check" CHECK ((
    "publicationFence" > 0 AND "mimeType" = 'image/webp' AND "sizeBytes" BETWEEN 1 AND 524288
    AND "width" BETWEEN 1 AND 512 AND "height" BETWEEN 1 AND 512
    AND "processorVersion" ~ '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'
    AND "sourceFingerprint" ~ '^[0-9a-f]{64}$' AND "sourceSha256" ~ '^[0-9a-f]{64}$'
    AND "implementationFingerprint" ~ '^[0-9a-f]{64}$' AND "sha256" ~ '^[0-9a-f]{64}$'
    AND (("state" = 'PURGED' AND "purgedAt" IS NOT NULL) OR ("state" <> 'PURGED' AND "purgedAt" IS NULL))
) IS TRUE);

ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_timestamps_check" CHECK ((
    isfinite("createdAt")
    AND isfinite("updatedAt")
    AND "updatedAt" >= "createdAt"
    AND ("leaseUntil" IS NULL OR (isfinite("leaseUntil") AND "leaseUntil" >= "createdAt"))
    AND ("nextAttemptAt" IS NULL OR (isfinite("nextAttemptAt") AND "nextAttemptAt" >= "createdAt"))
    AND ("finishedAt" IS NULL OR (isfinite("finishedAt") AND "finishedAt" >= "createdAt"))
) IS TRUE);

ALTER TABLE "ProcessingAttempt" ADD CONSTRAINT "ProcessingAttempt_timestamps_check" CHECK ((
    isfinite("createdAt")
    AND isfinite("updatedAt")
    AND "updatedAt" >= "createdAt"
    AND ("writeStartedAt" IS NULL OR (isfinite("writeStartedAt") AND "writeStartedAt" >= "createdAt"))
    AND ("writeSettledAt" IS NULL OR (isfinite("writeSettledAt") AND "writeSettledAt" >= "createdAt"))
    AND ("writesClosedAt" IS NULL OR (isfinite("writesClosedAt") AND "writesClosedAt" >= "createdAt"))
    AND ("objectAbsentAt" IS NULL OR (isfinite("objectAbsentAt") AND "objectAbsentAt" >= "createdAt"))
    AND ("reservationReleasedAt" IS NULL OR (isfinite("reservationReleasedAt") AND "reservationReleasedAt" >= "createdAt"))
    AND ("finalizedAt" IS NULL OR (isfinite("finalizedAt") AND "finalizedAt" >= "createdAt"))
    AND ("cleanupRetryAfter" IS NULL OR (isfinite("cleanupRetryAfter") AND "cleanupRetryAfter" >= "createdAt"))
    AND ("writeSettledAt" IS NULL OR ("writeStartedAt" IS NOT NULL AND "writeSettledAt" >= "writeStartedAt"))
    AND ("writesClosedAt" IS NULL OR ("writeStartedAt" IS NOT NULL AND "writesClosedAt" >= "writeStartedAt"))
    AND ("finalizedAt" IS NULL OR ("writeStartedAt" IS NOT NULL AND "finalizedAt" >= "writeStartedAt"))
) IS TRUE);

ALTER TABLE "DerivedObject" ADD CONSTRAINT "DerivedObject_timestamps_check" CHECK ((
    isfinite("createdAt")
    AND ("purgedAt" IS NULL OR (isfinite("purgedAt") AND "purgedAt" >= "createdAt"))
) IS TRUE);

COMMIT;

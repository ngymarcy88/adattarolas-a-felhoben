BEGIN;

CREATE TYPE "FileStatus" AS ENUM ('PENDING_UPLOAD', 'ACTIVE', 'SOFT_DELETED');
CREATE TYPE "FileVisibility" AS ENUM ('PRIVATE');

CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "displayName" VARCHAR(100) NOT NULL,
    "usedStorageBytes" BIGINT NOT NULL DEFAULT 0,
    "reservedStorageBytes" BIGINT NOT NULL DEFAULT 0,
    "storageLimitBytes" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "User_storage_accounting_check" CHECK (
        "usedStorageBytes" >= 0 AND "reservedStorageBytes" >= 0
        AND "storageLimitBytes" > 0
        AND "usedStorageBytes" + "reservedStorageBytes" <= "storageLimitBytes"
    )
);

CREATE TABLE "FileObject" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "storageKey" VARCHAR(1024) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "detectedMimeType" VARCHAR(100),
    "sizeBytes" BIGINT NOT NULL,
    "visibility" "FileVisibility" NOT NULL DEFAULT 'PRIVATE',
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "uploadUrlExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "confirmBy" TIMESTAMPTZ(3) NOT NULL,
    "cleanupRetryAfter" TIMESTAMPTZ(3),
    "cleanupAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "cleanupLastErrorCode" VARCHAR(100),
    "deletedAt" TIMESTAMPTZ(3),
    "purgeAfter" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FileObject_size_check" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 104857600),
    CONSTRAINT "FileObject_cleanup_count_check" CHECK ("cleanupAttemptCount" >= 0),
    CONSTRAINT "FileObject_upload_deadline_check" CHECK ("confirmBy" >= "uploadUrlExpiresAt"),
    CONSTRAINT "FileObject_state_timestamps_check" CHECK (
        ("status" = 'PENDING_UPLOAD' AND "deletedAt" IS NULL AND "purgeAfter" IS NULL)
        OR ("status" = 'ACTIVE' AND "detectedMimeType" IS NOT NULL
            AND "deletedAt" IS NULL AND "purgeAfter" IS NULL)
        OR ("status" = 'SOFT_DELETED' AND "detectedMimeType" IS NOT NULL
            AND "deletedAt" IS NOT NULL AND "purgeAfter" IS NOT NULL AND "purgeAfter" > "deletedAt")
    )
);

CREATE TABLE "ShareLink" (
    "id" UUID NOT NULL,
    "fileObjectId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShareLink_token_hash_check" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "ShareLink_expiry_check" CHECK (
        "expiresAt" >= "createdAt" + INTERVAL '1 hour'
        AND "expiresAt" <= "createdAt" + INTERVAL '7 days'
    )
);

CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "action" VARCHAR(100) NOT NULL,
    "resourceType" VARCHAR(100) NOT NULL,
    "resourceId" UUID,
    "requestId" VARCHAR(64) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "FileObject_storageKey_key" ON "FileObject"("storageKey");
CREATE UNIQUE INDEX "FileObject_id_ownerId_key" ON "FileObject"("id", "ownerId");
CREATE INDEX "FileObject_ownerId_status_createdAt_id_idx" ON "FileObject"("ownerId", "status", "createdAt" DESC, "id" DESC);
CREATE INDEX "FileObject_status_confirmBy_idx" ON "FileObject"("status", "confirmBy");
CREATE INDEX "FileObject_status_purgeAfter_idx" ON "FileObject"("status", "purgeAfter");
CREATE UNIQUE INDEX "ShareLink_tokenHash_key" ON "ShareLink"("tokenHash");
CREATE INDEX "ShareLink_expiresAt_idx" ON "ShareLink"("expiresAt");
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
CREATE INDEX "AuditEvent_resourceType_resourceId_idx" ON "AuditEvent"("resourceType", "resourceId");

ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_fileObjectId_createdByUserId_fkey"
    FOREIGN KEY ("fileObjectId", "createdByUserId") REFERENCES "FileObject"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;

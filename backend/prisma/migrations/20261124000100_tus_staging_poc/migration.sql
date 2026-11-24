ALTER TABLE "MultipartTransfer"
  ADD COLUMN "tusStaged" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tusCreateStarted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tusUploadId" VARCHAR(32),
  ADD CONSTRAINT "MultipartTransfer_tus_stage_check" CHECK (
    (NOT "tusStaged" AND NOT "tusCreateStarted" AND "tusUploadId" IS NULL)
    OR ("tusStaged" AND "partCount" = 1 AND "sizeBytes" < 5242880
      AND ("tusUploadId" IS NULL OR ("tusCreateStarted" AND "tusUploadId" ~ '^[0-9a-f]{32}$')))
  );

CREATE UNIQUE INDEX "MultipartTransfer_tusUploadId_key" ON "MultipartTransfer"("tusUploadId");

CREATE FUNCTION cloudvault_tus_staging_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."tusStaged" <> OLD."tusStaged"
    OR (OLD."tusCreateStarted" AND NOT NEW."tusCreateStarted")
    OR (OLD."tusUploadId" IS NOT NULL AND NEW."tusUploadId" IS DISTINCT FROM OLD."tusUploadId") THEN
    RAISE EXCEPTION 'Tus staging identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cloudvault_tus_staging_immutable
  BEFORE UPDATE ON "MultipartTransfer" FOR EACH ROW
  EXECUTE FUNCTION cloudvault_tus_staging_identity_guard();

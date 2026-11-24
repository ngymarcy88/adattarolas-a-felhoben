BEGIN;

ALTER TABLE "MultipartTransfer"
  ADD COLUMN "tusStageRemovedAt" TIMESTAMPTZ(3),
  ADD CONSTRAINT "MultipartTransfer_tus_success_cleanup_check" CHECK (
    "tusStageRemovedAt" IS NULL OR (
      "tusStaged" AND "tusUploadId" IS NOT NULL AND "state" = 'SUCCEEDED'
      AND "verifiedAt" IS NOT NULL AND "verifiedSha256" = "contentSha256"
      AND isfinite("tusStageRemovedAt") AND "tusStageRemovedAt" >= "verifiedAt"
      AND "cleanupRetryAfter" IS NULL
    ) IS TRUE
  );

CREATE INDEX "MultipartTransfer_tus_success_cleanup_idx"
  ON "MultipartTransfer"("tusStaged", "state", "tusStageRemovedAt", "cleanupRetryAfter");

CREATE FUNCTION cloudvault_tus_stage_removal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."tusStageRemovedAt" IS NOT NULL AND NEW."tusStageRemovedAt" IS DISTINCT FROM OLD."tusStageRemovedAt" THEN
    RAISE EXCEPTION 'Verified tus staging removal is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cloudvault_tus_stage_removal_immutable
  BEFORE UPDATE OF "tusStageRemovedAt" ON "MultipartTransfer" FOR EACH ROW
  EXECUTE FUNCTION cloudvault_tus_stage_removal_guard();

COMMIT;

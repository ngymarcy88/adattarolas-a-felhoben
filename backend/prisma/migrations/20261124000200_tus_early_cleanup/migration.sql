BEGIN;

ALTER TABLE "MultipartTransfer"
  ADD COLUMN "tusDeferred" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tusS3Started" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT "MultipartTransfer_tus_deferred_check" CHECK (
    (NOT "tusDeferred" OR "tusStaged")
    AND (NOT "tusS3Started" OR "tusDeferred")
    AND (NOT "tusDeferred" OR "tusS3Started"
      OR ("providerUploadId" IS NULL AND "state" IN ('CREATING','CANCELLED','EXPIRED','REJECTED')))
    AND ("closureEvidenceType" IS DISTINCT FROM 'tus_pre_s3_v1'
      OR ("tusDeferred" AND NOT "tusS3Started" AND "cleanupState" = 'VERIFIED'))
  );

CREATE FUNCTION cloudvault_tus_deferred_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."tusDeferred" <> OLD."tusDeferred"
    OR (OLD."tusS3Started" AND NOT NEW."tusS3Started")
    OR (NEW."tusS3Started" AND NOT OLD."tusS3Started"
      AND (OLD."state" <> 'CREATING' OR NEW."state" <> 'CREATING'
        OR OLD."publicationExcludedAt" IS NOT NULL OR NEW."publicationExcludedAt" IS NOT NULL))
    OR (OLD."closureEvidenceType" = 'tus_pre_s3_v1'
      AND (NEW."closureEvidenceType", NEW."closureEvidenceRef", NEW."writesClosedAt", NEW."objectAbsentAt", NEW."partsAbsentAt")
        IS DISTINCT FROM (OLD."closureEvidenceType", OLD."closureEvidenceRef", OLD."writesClosedAt", OLD."objectAbsentAt", OLD."partsAbsentAt"))
  THEN
    RAISE EXCEPTION 'Deferred tus write authorization and closure are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cloudvault_tus_deferred_immutable
  BEFORE UPDATE ON "MultipartTransfer" FOR EACH ROW
  EXECUTE FUNCTION cloudvault_tus_deferred_guard();

CREATE FUNCTION cloudvault_tus_provider_intent_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE transfer "MultipartTransfer";
BEGIN
  SELECT * INTO transfer FROM "MultipartTransfer" WHERE id = NEW."transferId" FOR SHARE;
  IF transfer."tusDeferred" AND (NOT transfer."tusS3Started"
    OR (NEW.kind <> 'ABORT' AND transfer."publicationExcludedAt" IS NOT NULL)) THEN
    RAISE EXCEPTION 'Deferred tus transfer has no provider write authorization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cloudvault_tus_provider_intent
  BEFORE INSERT ON "MultipartIoOperation" FOR EACH ROW
  EXECUTE FUNCTION cloudvault_tus_provider_intent_guard();

COMMIT;

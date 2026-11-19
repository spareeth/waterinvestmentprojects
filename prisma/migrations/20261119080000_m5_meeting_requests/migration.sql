-- M5 (PLAN v0.3 section 6): MeetingRequest(organisation, role, note, status, decidedById, decidedAt).
-- Removes type, rank, decidedOnBehalf and message. Data-preserving: message becomes the note; organisation and
-- role come from the requester's account (organisation, jobTitle) where known.

ALTER TABLE "MeetingRequest"
  ADD COLUMN "organisation" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "role" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "note" TEXT NOT NULL DEFAULT '';

UPDATE "MeetingRequest" AS m
SET "organisation" = COALESCE(u."organisation", ''),
    "role" = COALESCE(u."jobTitle", ''),
    "note" = COALESCE(m."message", '')
FROM "User" AS u
WHERE u."id" = m."requesterId";

ALTER TABLE "MeetingRequest"
  ALTER COLUMN "organisation" DROP DEFAULT,
  ALTER COLUMN "role" DROP DEFAULT,
  DROP COLUMN "type",
  DROP COLUMN "message",
  DROP COLUMN "rank",
  DROP COLUMN "decidedOnBehalf";

DROP TYPE "MeetingRequestType";

-- Inbox lists by country project and status; "my requests" by requester and project.
DROP INDEX IF EXISTS "MeetingRequest_requesterId_idx";
CREATE INDEX "MeetingRequest_requesterId_projectId_idx" ON "MeetingRequest"("requesterId", "projectId");

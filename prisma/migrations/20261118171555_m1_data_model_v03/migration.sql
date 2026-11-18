-- M1 (PLAN v0.3 data model, 18 Nov 2026). Hand-edited from `prisma migrate diff` so existing rows survive:
-- Project.name is renamed to title (not dropped), every existing teaser gets a Submission before
-- Document.submissionId becomes NOT NULL, and CountryContact is filled from the upload link submissions.

-- CreateEnum
CREATE TYPE "CountryContactRole" AS ENUM ('FOCAL_POINT', 'WBG_COORDINATOR');

-- CreateTable
CREATE TABLE "CountryContact" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "CountryContactRole" NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CountryContact_userId_idx" ON "CountryContact"("userId");
CREATE UNIQUE INDEX "CountryContact_countryId_email_role_key" ON "CountryContact"("countryId", "email", "role");
ALTER TABLE "CountryContact" ADD CONSTRAINT "CountryContact_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CountryContact" ADD CONSTRAINT "CountryContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Project: name -> title (data kept), developmentStage added, tier and the government-entered fields removed.
ALTER TABLE "Project" RENAME COLUMN "name" TO "title";
DROP INDEX "Project_status_tier_idx";
ALTER TABLE "Project" DROP COLUMN "counterparty",
DROP COLUMN "documentsPrepared",
DROP COLUMN "feedbackSought",
DROP COLUMN "revenueModel",
DROP COLUMN "tenderTimeline",
DROP COLUMN "tier",
ADD COLUMN     "developmentStage" TEXT;
DROP TYPE "ProjectTier";

-- Submission: uploadLinkId optional (portal workspace uploads have no link); deleting a link stays refused.
ALTER TABLE "Submission" DROP CONSTRAINT "Submission_uploadLinkId_fkey";
ALTER TABLE "Submission" ALTER COLUMN "uploadLinkId" DROP NOT NULL;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_uploadLinkId_fkey" FOREIGN KEY ("uploadLinkId") REFERENCES "UploadLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Document: submissionId, filled before it becomes NOT NULL.
ALTER TABLE "Document" ADD COLUMN "submissionId" TEXT;

-- 1. Teasers of upload link projects: the project's submission.
UPDATE "Document" d SET "submissionId" = p."submissionId"
FROM "Project" p
WHERE d."projectId" = p."id" AND p."submissionId" IS NOT NULL;

-- 2. Teasers uploaded in the portal workspace before M1: one Submission per project, recording the latest
--    publish acknowledgement where there was one, otherwise the wording version "none-before-m1".
INSERT INTO "Submission" ("id", "countryId", "uploadLinkId", "uploaderName", "uploaderEmail", "ackTextVersion",
                          "ackAcceptedAt", "ip", "createdAt")
SELECT
    'm1-' || p."id",
    p."countryId",
    NULL,
    COALESCE(u."name", 'Unknown (uploaded before M1)'),
    COALESCE(u."email", 'unknown@invalid'),
    COALESCE(a."textVersion", 'none-before-m1'),
    COALESCE(a."acceptedAt", first_doc."uploadedAt"),
    a."ip",
    first_doc."uploadedAt"
FROM "Project" p
JOIN LATERAL (
    SELECT d."uploadedAt", d."uploadedById" FROM "Document" d
    WHERE d."projectId" = p."id" AND d."submissionId" IS NULL
    ORDER BY d."version" ASC LIMIT 1
) first_doc ON TRUE
LEFT JOIN "User" u ON u."id" = first_doc."uploadedById"
LEFT JOIN LATERAL (
    SELECT ack."textVersion", ack."acceptedAt", ack."ip" FROM "Acknowledgement" ack
    WHERE ack."projectId" = p."id"
    ORDER BY ack."acceptedAt" DESC LIMIT 1
) a ON TRUE;

UPDATE "Document" d SET "submissionId" = 'm1-' || d."projectId" WHERE d."submissionId" IS NULL;

ALTER TABLE "Document" ALTER COLUMN "submissionId" SET NOT NULL;
ALTER TABLE "Document" DROP COLUMN "docDate",
DROP COLUMN "title",
ALTER COLUMN "allowDownload" SET DEFAULT true;
CREATE INDEX "Document_submissionId_idx" ON "Document"("submissionId");
ALTER TABLE "Document" ADD CONSTRAINT "Document_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Acknowledgement is replaced by Submission (PLAN v0.3).
ALTER TABLE "Acknowledgement" DROP CONSTRAINT "Acknowledgement_documentId_fkey";
ALTER TABLE "Acknowledgement" DROP CONSTRAINT "Acknowledgement_projectId_fkey";
ALTER TABLE "Acknowledgement" DROP CONSTRAINT "Acknowledgement_userId_fkey";
DROP TABLE "Acknowledgement";

-- Country contacts from the upload link submissions: each uploader becomes a FOCAL_POINT contact of the
-- submission's country (PLAN section 3), with the name from their latest submission.
INSERT INTO "CountryContact" ("id", "countryId", "name", "email", "role", "createdAt", "updatedAt")
SELECT DISTINCT ON (s."countryId", lower(s."uploaderEmail"))
    'm1-' || s."id",
    s."countryId",
    s."uploaderName",
    lower(s."uploaderEmail"),
    'FOCAL_POINT',
    s."createdAt",
    CURRENT_TIMESTAMP
FROM "Submission" s
WHERE s."uploadLinkId" IS NOT NULL
ORDER BY s."countryId", lower(s."uploaderEmail"), s."createdAt" DESC;

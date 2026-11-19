-- M3 (PLAN v0.3 section 4 and "Removed"): every invited investor sees every published teaser, so the per-user
-- pipeline scopes go; post-meeting extra material (ProjectGrant) and the data room go with the EXTRA and
-- DATAROOM document kinds.
--
-- Documents of the removed kinds: no screen ever created them (only the old seed did). They are deleted, after
-- unlinking any version chain that points at them, so the enum can be narrowed. Their blob files are not
-- touched; nothing can serve them any more.
UPDATE "Document" SET "supersededById" = NULL
WHERE "supersededById" IN (SELECT "id" FROM "Document" WHERE "kind" <> 'TEASER');
DELETE FROM "Document" WHERE "kind" <> 'TEASER';

-- AlterEnum
BEGIN;
CREATE TYPE "DocumentKind_new" AS ENUM ('TEASER');
ALTER TABLE "Document" ALTER COLUMN "kind" TYPE "DocumentKind_new" USING ("kind"::text::"DocumentKind_new");
ALTER TYPE "DocumentKind" RENAME TO "DocumentKind_old";
ALTER TYPE "DocumentKind_new" RENAME TO "DocumentKind";
DROP TYPE "DocumentKind_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "PipelineCountry" DROP CONSTRAINT "PipelineCountry_userId_fkey";

-- DropForeignKey
ALTER TABLE "PipelineCountry" DROP CONSTRAINT "PipelineCountry_countryId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectGrant" DROP CONSTRAINT "ProjectGrant_userId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectGrant" DROP CONSTRAINT "ProjectGrant_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectGrant" DROP CONSTRAINT "ProjectGrant_grantedById_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "pipelineScope";

-- AlterTable
ALTER TABLE "Invitation" DROP COLUMN "pipelineScope";

-- DropTable
DROP TABLE "PipelineCountry";

-- DropTable
DROP TABLE "ProjectGrant";

-- DropEnum
DROP TYPE "PipelineScope";

-- DropEnum
DROP TYPE "GrantScope";

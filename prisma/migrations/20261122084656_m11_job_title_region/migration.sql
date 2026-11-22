-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "region" TEXT;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "uploaderJobTitle" TEXT NOT NULL DEFAULT '';

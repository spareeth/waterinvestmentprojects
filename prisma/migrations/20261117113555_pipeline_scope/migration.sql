-- CreateEnum
CREATE TYPE "PipelineScope" AS ENUM ('NONE', 'ALL', 'SELECTED');

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "pipelineScope" "PipelineScope" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pipelineScope" "PipelineScope" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "PipelineCountry" (
    "userId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineCountry_pkey" PRIMARY KEY ("userId","countryId")
);

-- CreateIndex
CREATE INDEX "PipelineCountry_countryId_idx" ON "PipelineCountry"("countryId");

-- AddForeignKey
ALTER TABLE "PipelineCountry" ADD CONSTRAINT "PipelineCountry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineCountry" ADD CONSTRAINT "PipelineCountry_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill (PLAN v0.2: every invited investor sees the whole pipeline). Everyone else stays NONE.
UPDATE "User" SET "pipelineScope" = 'ALL' WHERE "role" = 'INVESTOR';
UPDATE "Invitation" SET "pipelineScope" = 'ALL' WHERE "role" = 'INVESTOR';

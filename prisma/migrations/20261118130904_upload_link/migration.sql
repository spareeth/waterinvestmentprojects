-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_uploadedById_fkey";

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "uploadedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "submissionId" TEXT,
ALTER COLUMN "tier" DROP NOT NULL;

-- CreateTable
CREATE TABLE "UploadLink" (
    "id" TEXT NOT NULL,
    "countryId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "uploadLinkId" TEXT NOT NULL,
    "uploaderName" TEXT NOT NULL,
    "uploaderEmail" TEXT NOT NULL,
    "ackTextVersion" TEXT NOT NULL,
    "ackAcceptedAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UploadLink_tokenHash_key" ON "UploadLink"("tokenHash");

-- CreateIndex
CREATE INDEX "UploadLink_countryId_idx" ON "UploadLink"("countryId");

-- CreateIndex
CREATE INDEX "Submission_countryId_createdAt_idx" ON "Submission"("countryId", "createdAt");

-- CreateIndex
CREATE INDEX "Submission_uploadLinkId_idx" ON "Submission"("uploadLinkId");

-- CreateIndex
CREATE INDEX "Project_submissionId_idx" ON "Project"("submissionId");

-- AddForeignKey
ALTER TABLE "UploadLink" ADD CONSTRAINT "UploadLink_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadLink" ADD CONSTRAINT "UploadLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_uploadLinkId_fkey" FOREIGN KEY ("uploadLinkId") REFERENCES "UploadLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

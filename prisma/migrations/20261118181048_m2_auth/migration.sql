-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'WBG_COORDINATOR';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "investorAckAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "investorAckTextVersion" TEXT,
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

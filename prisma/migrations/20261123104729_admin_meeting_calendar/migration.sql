-- AlterEnum
ALTER TYPE "MeetingRequestStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "SlotStatus" ADD VALUE 'BLOCKED';

-- AlterTable
ALTER TABLE "Slot" ADD COLUMN     "blockedReason" TEXT;

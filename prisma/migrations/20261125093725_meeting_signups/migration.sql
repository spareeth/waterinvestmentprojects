-- CreateEnum
CREATE TYPE "MeetingSignupStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "Country" ADD COLUMN     "meetingCounterparts" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "MeetingBlock" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingSignup" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "organisation" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "slotStarts" TIMESTAMP(3)[],
    "status" "MeetingSignupStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingSignup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingSignupProject" (
    "signupId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "MeetingSignupProject_pkey" PRIMARY KEY ("signupId","projectId")
);

-- CreateIndex
CREATE INDEX "MeetingBlock_countryId_startsAt_idx" ON "MeetingBlock"("countryId", "startsAt");

-- CreateIndex
CREATE INDEX "MeetingSignup_requesterId_idx" ON "MeetingSignup"("requesterId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingSignup_countryId_requesterId_key" ON "MeetingSignup"("countryId", "requesterId");

-- CreateIndex
CREATE INDEX "MeetingSignupProject_projectId_idx" ON "MeetingSignupProject"("projectId");

-- AddForeignKey
ALTER TABLE "MeetingBlock" ADD CONSTRAINT "MeetingBlock_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingBlock" ADD CONSTRAINT "MeetingBlock_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSignup" ADD CONSTRAINT "MeetingSignup_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSignup" ADD CONSTRAINT "MeetingSignup_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSignupProject" ADD CONSTRAINT "MeetingSignupProject_signupId_fkey" FOREIGN KEY ("signupId") REFERENCES "MeetingSignup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSignupProject" ADD CONSTRAINT "MeetingSignupProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

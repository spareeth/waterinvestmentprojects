-- CreateEnum
CREATE TYPE "OrganisationType" AS ENUM ('INFRASTRUCTURE_OPERATOR', 'INVESTOR_FUND', 'DFI_MDB', 'COMMERCIAL_BANK', 'ADVISER', 'OTHER');

-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "organisationType" "OrganisationType";

-- CreateTable
CREATE TABLE "ApprovedOrganisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailDomains" TEXT[],
    "source" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovedOrganisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovedContact" (
    "email" TEXT NOT NULL,
    "organisationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovedContact_pkey" PRIMARY KEY ("email")
);

-- AddForeignKey
ALTER TABLE "ApprovedContact" ADD CONSTRAINT "ApprovedContact_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "ApprovedOrganisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

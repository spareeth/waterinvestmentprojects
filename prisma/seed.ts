// Seeds the database with fictional demo data (Countries A to E). Safe to re-run: every row has a fixed id
// and is upserted, so a second run leaves the same data in place.
// Run with `npm run db:seed` (Prisma calls this file via the seed setting in prisma.config.ts).

import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedData } from "./seed/data";

/** Placeholder PDFs are written here so they can be inspected or loaded into object storage (M5). */
const BLOB_DIR = path.resolve(process.cwd(), ".data", "blobs");

function assertSafeToSeed(): string {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env first.",
    );
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_DEMO_SEED !== "true"
  ) {
    throw new Error(
      "Refusing to load demo data with NODE_ENV=production. Set ALLOW_DEMO_SEED=true on staging only.",
    );
  }
  return url;
}

async function writeBlobs(): Promise<void> {
  for (const [blobKey, bytes] of seedData.documentFiles) {
    const file = path.join(BLOB_DIR, blobKey);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: assertSafeToSeed() }),
  });
  const d = seedData;

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const { id, ...data } of d.countries) {
          await tx.country.upsert({
            where: { id },
            create: { id, ...data },
            update: data,
          });
        }
        for (const { id, ...data } of d.users) {
          await tx.user.upsert({
            where: { id },
            create: { id, ...data },
            update: data,
          });
        }
        for (const m of d.memberships) {
          await tx.countryMembership.upsert({
            where: {
              userId_countryId: { userId: m.userId, countryId: m.countryId },
            },
            create: m,
            update: { role: m.role },
          });
        }
        for (const { id, ...data } of d.invitations) {
          await tx.invitation.upsert({
            where: { id },
            create: { id, ...data },
            update: data,
          });
        }
        for (const { id, ...data } of d.projects) {
          await tx.project.upsert({
            where: { id },
            create: { id, ...data },
            update: data,
          });
        }
        // Documents first without the supersededBy link (it points at another document), then link.
        for (const { id, ...rest } of d.documents) {
          const data = { ...rest, supersededById: null };
          await tx.document.upsert({
            where: { id },
            create: { id, ...data },
            update: data,
          });
        }
        for (const doc of d.documents) {
          await tx.document.update({
            where: { id: doc.id },
            data: { supersededById: doc.supersededById },
          });
        }
        for (const { id, ...data } of d.acknowledgements) {
          await tx.acknowledgement.upsert({
            where: { id },
            create: { id, ...data },
            update: data,
          });
        }
        for (const { id, ...data } of d.meetingRequests) {
          await tx.meetingRequest.upsert({
            where: { id },
            create: { id, ...data },
            update: data,
          });
        }
        for (const { id, ...data } of d.rooms) {
          await tx.room.upsert({
            where: { id },
            create: { id, ...data },
            update: data,
          });
        }
        // Clear seed slot links first so a moved booking cannot clash with the unique meetingRequestId.
        await tx.slot.updateMany({
          where: { id: { startsWith: "seed-" } },
          data: { meetingRequestId: null },
        });
        for (const { id, ...data } of d.slots) {
          await tx.slot.upsert({
            where: { id },
            create: { id, ...data },
            update: data,
          });
        }
        for (const { id, ...data } of d.projectGrants) {
          await tx.projectGrant.upsert({
            where: { id },
            create: { id, ...data },
            update: data,
          });
        }
        for (const { id, ...data } of d.auditEvents) {
          await tx.auditEvent.upsert({
            where: { id },
            create: { id, ...data },
            update: data,
          });
        }
      },
      { timeout: 60_000 },
    );

    await writeBlobs();

    const counts = {
      countries: await prisma.country.count(),
      users: await prisma.user.count(),
      memberships: await prisma.countryMembership.count(),
      invitations: await prisma.invitation.count(),
      projects: await prisma.project.count(),
      documents: await prisma.document.count(),
      acknowledgements: await prisma.acknowledgement.count(),
      meetingRequests: await prisma.meetingRequest.count(),
      rooms: await prisma.room.count(),
      slots: await prisma.slot.count(),
      projectGrants: await prisma.projectGrant.count(),
      auditEvents: await prisma.auditEvent.count(),
    };
    console.log("Seed complete (fictional demo data). Row counts:");
    console.table(counts);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

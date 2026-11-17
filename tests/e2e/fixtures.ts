// Test data for the end-to-end sign-in tests, run with tsx from the Playwright specs:
//   tsx tests/e2e/fixtures.ts create   -> prints JSON with a fresh invitation token and a pending account
//   tsx tests/e2e/fixtures.ts clean    -> removes everything on the @e2e.example domain
// Kept out of the Playwright process because the generated Prisma client is ESM-only.

import "dotenv/config";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../../src/generated/prisma/client";
import { UserRole, UserStatus } from "../../src/generated/prisma/enums";

const DOMAIN = "e2e.example";
export const E2E_PASSWORD = "End-to-end-test-pass-1";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

async function clean(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${DOMAIN}` } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.auditEvent.deleteMany({
    where: {
      OR: [
        { actorId: { in: ids } },
        { entityId: { in: ids } },
        { metadata: { path: ["email"], string_ends_with: `@${DOMAIN}` } },
      ],
    },
  });
  await prisma.invitation.deleteMany({
    where: { email: { endsWith: `@${DOMAIN}` } },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

async function createUser(email: string, role: UserRole, status: UserStatus) {
  const user = await prisma.user.create({
    data: { email, name: "E2E Person", role, status, emailVerified: true },
  });
  await prisma.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: await hashPassword(E2E_PASSWORD),
    },
  });
  return user;
}

async function create(): Promise<void> {
  const suffix = randomUUID().slice(0, 8);
  const admin = await createUser(
    `admin-${suffix}@${DOMAIN}`,
    UserRole.SUMMIT_ADMIN,
    UserStatus.ACTIVE,
  );
  const pending = await createUser(
    `pending-${suffix}@${DOMAIN}`,
    UserRole.INVESTOR,
    UserStatus.PENDING_APPROVAL,
  );
  const token = randomBytes(32).toString("base64url");
  const inviteeEmail = `invitee-${suffix}@${DOMAIN}`;
  await prisma.invitation.create({
    data: {
      email: inviteeEmail,
      role: UserRole.INVESTOR,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60 * 60_000),
      invitedById: admin.id,
    },
  });
  process.stdout.write(
    JSON.stringify({
      token,
      inviteeEmail,
      pendingEmail: pending.email,
      password: E2E_PASSWORD,
    }),
  );
}

const command = process.argv[2];
(command === "create" ? create() : clean())
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

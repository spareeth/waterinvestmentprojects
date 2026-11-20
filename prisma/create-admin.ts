// Creates the first admin account on a new server (M8), where the demo seed must not run. Accounts are
// handed out by admins (PLAN 0a.4), so somebody has to be the first: this prints a temporary password once; the
// person must choose their own at first sign-in. Everyone else is then created in the admin console.
//
// Usage (on the server, see docs/DEPLOYMENT.md):
//   docker compose -f compose.production.yml run --rm tools npm run admin:create -- \
//     --email someone@example.org --name "Full Name" [--role PLATFORM_ADMIN|SUMMIT_ADMIN] [--organisation "Terra"]

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { UserRole, UserStatus } from "../src/generated/prisma/enums";
import { AUTH_AUDIT } from "../src/lib/auth/constants";
import { generateTemporaryPassword } from "../src/lib/auth/temporary-password";

const ADMIN_ROLES = [UserRole.PLATFORM_ADMIN, UserRole.SUMMIT_ADMIN] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

function readArgs(): {
  email: string;
  name: string;
  role: AdminRole;
  organisation: string | null;
} {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string", default: UserRole.PLATFORM_ADMIN },
      organisation: { type: "string" },
    },
  });
  const email = values.email?.trim().toLowerCase() ?? "";
  const name = values.name?.trim() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) {
    throw new Error(
      'Give --email and --name, for example: --email someone@example.org --name "Full Name"',
    );
  }
  if (!ADMIN_ROLES.includes(values.role as AdminRole)) {
    throw new Error(`--role must be one of ${ADMIN_ROLES.join(", ")}`);
  }
  return {
    email,
    name,
    role: values.role as AdminRole,
    organisation: values.organisation?.trim() || null,
  };
}

async function main(): Promise<void> {
  const input = readArgs();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      throw new Error(
        `An account for ${input.email} already exists. Use the admin console to issue a new temporary password.`,
      );
    }
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const userId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          organisation: input.organisation,
          role: input.role,
          status: UserStatus.ACTIVE,
          emailVerified: true,
          mustChangePassword: true,
        },
        select: { id: true },
      });
      // Better Auth finds the password through the credential account whose accountId is the user id.
      await tx.account.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: passwordHash,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: null,
          action: AUTH_AUDIT.ACCOUNT_CREATE,
          entityType: "User",
          entityId: user.id,
          metadata: {
            email: input.email,
            role: input.role,
            countryIds: [],
            via: "create_admin_command",
          },
        },
      });
      return user.id;
    });
    console.log(
      [
        "",
        `Created ${input.role} account ${input.email} (id ${userId}).`,
        "",
        `Temporary password: ${temporaryPassword}`,
        "",
        "It is shown only now and is not stored anywhere readable. Pass it on personally; the person must choose",
        "their own password at first sign-in.",
        "",
      ].join("\n"),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`create-admin: ${(error as Error).message}`);
  process.exit(1);
});

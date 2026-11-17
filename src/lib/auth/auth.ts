import "server-only";
import { APIError, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import type { PrismaClient } from "@/generated/prisma/client";
import { UserStatus } from "@/generated/prisma/enums";
import { appConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { type Env, getEnv } from "@/lib/env";
import { AUTH_ERROR, MIN_PASSWORD_LENGTH } from "./constants";
import { isLockedOut } from "./lockout";

// Better Auth configuration. No HTTP handler is mounted: every sign-in step is a server action that calls
// auth.api.* (src/lib/auth/service.ts), so all of them go through our own checks, rate limits and audit.

export interface AuthOptions {
  env: Pick<
    Env,
    | "APP_URL"
    | "BETTER_AUTH_SECRET"
    | "SELF_REGISTRATION_ENABLED"
    | "SESSION_MAX_HOURS"
  >;
  prisma?: PrismaClient;
}

export function createAuth({ env, prisma = db }: AuthOptions) {
  return betterAuth({
    appName: appConfig.name,
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    telemetry: { enabled: false },
    advanced: {
      // Ids come from the database defaults (cuid), like every other table.
      database: { generateId: false },
      cookiePrefix: "portal",
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: 128,
      // Self-registration is built but off by default (PLAN F2).
      disableSignUp: !env.SELF_REGISTRATION_ENABLED,
      autoSignIn: true,
    },
    session: {
      // Absolute lifetime. The idle timeout is enforced in src/lib/auth/session.ts.
      expiresIn: env.SESSION_MAX_HOURS * 60 * 60,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: true,
          // Self-registration creates investors only; invitations set the role server-side.
          defaultValue: "INVESTOR",
          input: false,
        },
        status: {
          type: "string",
          required: true,
          defaultValue: UserStatus.PENDING_APPROVAL,
          input: false,
        },
        organisation: { type: "string", required: false },
        jobTitle: { type: "string", required: false },
        termsAcceptedAt: { type: "date", required: false, input: false },
      },
    },
    // Better Auth's HTTP rate limiter does not apply to direct auth.api calls; see src/lib/auth/rate-limit.ts.
    rateLimit: { enabled: false },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email") return;
        const email = normaliseEmail(String(ctx.body?.email ?? ""));
        if (await isLockedOut(email, prisma)) {
          throw new APIError("TOO_MANY_REQUESTS", {
            message: "Too many attempts",
            code: AUTH_ERROR.LOCKED,
          });
        }
        const user = await prisma.user.findUnique({
          where: { email },
          select: { status: true },
        });
        if (user?.status === UserStatus.DEACTIVATED) {
          // Same response as a wrong password, so the form does not reveal which accounts exist.
          throw new APIError("UNAUTHORIZED", {
            message: "Invalid email or password",
            code: AUTH_ERROR.DEACTIVATED,
          });
        }
      }),
    },
    databaseHooks: {
      session: {
        create: {
          // Backstop for every way a session can be created (password, second step, enrolment).
          before: async (session) => {
            const user = await prisma.user.findUnique({
              where: { id: session.userId },
              select: { status: true },
            });
            if (!user || user.status === UserStatus.DEACTIVATED) {
              throw new APIError("UNAUTHORIZED", {
                message: "Invalid email or password",
                code: AUTH_ERROR.DEACTIVATED,
              });
            }
          },
        },
      },
    },
    plugins: [
      twoFactor({
        issuer: appConfig.name,
        // Better Auth's own flag is stored in the PLAN field User.mfaEnabled.
        schema: { user: { fields: { twoFactorEnabled: "mfaEnabled" } } },
        backupCodeOptions: { amount: 10, length: 10 },
        // Pending second-step challenge lives for 10 minutes.
        twoFactorCookieMaxAge: 600,
      }),
      // Must be last so it sees cookies set by the other plugins.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

let instance: Auth | undefined;

/** The application's Better Auth instance, built on first use so builds do not need runtime secrets. */
export function getAuth(): Auth {
  instance ??= createAuth({ env: getEnv() });
  return instance;
}

import "server-only";
import { z } from "zod";

/** Only "true" switches a flag on; anything other than "true", "false" or empty is a configuration error. */
const flag = z
  .enum(["true", "false", ""])
  .optional()
  .transform((value) => value === "true");

/** Like `flag`, but on unless set to "false". */
const flagDefaultOn = z
  .enum(["true", "false", ""])
  .optional()
  .transform((value) => value !== "false");

function intInRange(min: number, max: number, fallback: number) {
  return z.coerce
    .number()
    .int()
    .min(min)
    .max(max)
    .optional()
    .transform((value) => value ?? fallback);
}

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    /**
     * Deployment environment. Staging runs a production build (NODE_ENV=production), so this is what tells
     * staging and production apart. Defaults to "production" whenever NODE_ENV is production (fail safe).
     */
    APP_ENV: z.enum(["development", "staging", "production"]).optional(),
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a PostgreSQL URL"),
    APP_URL: z.url().default("http://localhost:3000"),
    /** Signs session cookies and encrypts two-step secrets. At least 32 characters; never commit it. */
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    /**
     * M13 (PLAN v0.4 0b.17): investors and operators register at /register. On unless set to "false". A
     * registration waits for a Summit admin, unless REGISTRATION_AUTO_APPROVE lets a pre-approved one straight in.
     */
    SELF_REGISTRATION_ENABLED: flagDefaultOn,
    /**
     * M13 (PLAN v0.4 0b.18): "true" gives a registrant on the pre-approved list (exact email, or an approved
     * organisation's email domain) immediate access. Off by default: the portal does not yet verify that the
     * registrant owns the address, so anyone could type a listed email. Switch on only once that risk is accepted
     * or email verification is in place.
     */
    REGISTRATION_AUTO_APPROVE: flag,
    /**
     * M13 (PLAN v0.4 0b.19, 0b.26): "true" emails a registrant when the Summit team approves or rejects them. Off
     * until the mailbox reaches Outlook and Gmail inboxes; access details go out personally until then.
     */
    REGISTRATION_NOTIFY_REGISTRANT: flag,
    /**
     * Second step at sign-in (PLAN 0a.3, 18 Nov: email and password only for now). "none" (default) asks for no
     * second step; "totp" requires an authenticator app (built in the old M3, kept dormant). Email codes come
     * once the Summit mailbox is live. An authenticator someone already set up is still asked for under "none".
     */
    AUTH_SECOND_STEP: z
      .enum(["none", "totp", ""])
      .optional()
      .transform((value): "none" | "totp" =>
        value === "totp" ? value : "none",
      ),
    /** Signed out after this many minutes without activity. */
    SESSION_IDLE_MINUTES: intInRange(5, 24 * 60, 120),
    /** Signed out this many hours after signing in, whatever the activity. */
    SESSION_MAX_HOURS: intInRange(1, 72, 12),
    /** Where uploaded files live. Only "local" exists until M10 adds S3-compatible storage (MinIO). */
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    /** Folder for the local driver, relative to the app folder unless absolute. Git-ignored. */
    STORAGE_LOCAL_DIR: z.string().min(1).default(".data/blobs"),
    /**
     * Virus scan of uploads. "clamav" (production, M8) scans every upload with clamd at CLAMAV_HOST:CLAMAV_PORT
     * and only then makes it visible. "pending" (default) leaves uploads PENDING, so nobody can open or publish
     * them; "assume-clean" marks them CLEAN at once, for local and staging demos only.
     */
    UPLOAD_SCAN: z
      .enum(["pending", "assume-clean", "clamav", ""])
      .optional()
      .transform((value): "pending" | "assume-clean" | "clamav" =>
        value === "assume-clean" || value === "clamav" ? value : "pending",
      ),
    /** clamd's address (the `clamav` service in compose.production.yml). */
    CLAMAV_HOST: z
      .string()
      .optional()
      .transform((value) => value?.trim() || "localhost"),
    CLAMAV_PORT: intInRange(1, 65535, 3310),
    /** How often files still waiting for a scan are tried again (for example after clamd restarted). */
    SCAN_SWEEP_SECONDS: intInRange(10, 3600, 60),
    /**
     * How email is sent (user decision, 18 Nov: from the Summit mailbox, provider still to be chosen).
     * "log" (default) writes each message to the server log; "smtp" sends through SMTP_HOST, which works with any
     * provider (Microsoft 365, Google Workspace, Zoho) and with Mailpit locally.
     */
    MAIL_DRIVER: z
      .enum(["log", "smtp", ""])
      .optional()
      .transform((value): "log" | "smtp" => (value === "smtp" ? value : "log")),
    /** Sender address, e.g. summit@waterinvestmentprojects.org. Required for smtp. */
    MAIL_FROM: z
      .union([z.email(), z.literal("")])
      .optional()
      .transform((value) => value || null),
    /** Summit team mailbox told about uploads (and later projects and bookings). Comma-separated; empty = none. */
    ADMIN_NOTIFY_EMAIL: z
      .string()
      .optional()
      .transform((value, ctx) => {
        const list = (value ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const address of list) {
          if (!z.email().safeParse(address).success) {
            ctx.addIssue({
              code: "custom",
              message:
                "ADMIN_NOTIFY_EMAIL must be a comma-separated list of email addresses",
            });
            return z.NEVER;
          }
        }
        return list;
      }),
    /**
     * M5 (user decision, 18 Nov: built but off until WBG decides). "true" emails a country's FOCAL_POINT contacts
     * about each new meeting request, with its WBG_COORDINATOR contacts in copy. The Summit mailbox is always told.
     */
    REQUEST_NOTIFY_FOCAL_POINTS: flag,
    /** M5: "true" emails the investor when the country accepts or declines their meeting request. Off by default. */
    REQUEST_NOTIFY_INVESTOR: flag,
    /** 25 Nov: emails the country's focal points (coordinators in copy) on every meeting sign-up. On unless "false". */
    SIGNUP_NOTIFY_COUNTRIES: flagDefaultOn,
    SMTP_HOST: z
      .string()
      .optional()
      .transform((value) => value?.trim() || null),
    SMTP_PORT: intInRange(1, 65535, 587),
    /** "true" for implicit TLS (port 465); otherwise STARTTLS is required, except on localhost (Mailpit). */
    SMTP_SECURE: flag,
    SMTP_USER: z
      .string()
      .optional()
      .transform((value) => value || null),
    /** Secret: only in the server's root-only .env, never in the repo. */
    SMTP_PASSWORD: z
      .string()
      .optional()
      .transform((value) => value || null),
  })
  .transform(({ APP_ENV, ...rest }) => ({
    ...rest,
    APP_ENV:
      APP_ENV ??
      (rest.NODE_ENV === "production" ? "production" : "development"),
  }))
  .superRefine((env, ctx) => {
    if (env.MAIL_DRIVER === "smtp") {
      for (const key of ["SMTP_HOST", "MAIL_FROM"] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when MAIL_DRIVER is smtp`,
          });
        }
      }
      if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
        ctx.addIssue({
          code: "custom",
          path: ["SMTP_USER"],
          message: "set both SMTP_USER and SMTP_PASSWORD, or neither",
        });
      }
    }
    if (env.UPLOAD_SCAN === "assume-clean" && env.APP_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["UPLOAD_SCAN"],
        message:
          "assume-clean skips the virus scan and cannot be used when APP_ENV is production",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Validates a set of environment variables. Throws with the failing variable names, never their values. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration (${problems})`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Server-side environment, validated on first use so that builds do not need runtime secrets. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

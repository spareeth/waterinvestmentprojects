import "server-only";
import { z } from "zod";

/** Only "true" switches a flag on; anything other than "true", "false" or empty is a configuration error. */
const flag = z
  .enum(["true", "false", ""])
  .optional()
  .transform((value) => value === "true");

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
    /** Self-registration is built but off; self-registered accounts wait for a Summit admin. */
    SELF_REGISTRATION_ENABLED: flag,
    /** Demo only: makes two-step enrolment optional. Refused when APP_ENV is production. */
    AUTH_SKIP_SECOND_STEP: flag,
    /** Signed out after this many minutes without activity. */
    SESSION_IDLE_MINUTES: intInRange(5, 24 * 60, 120),
    /** Signed out this many hours after signing in, whatever the activity. */
    SESSION_MAX_HOURS: intInRange(1, 72, 12),
    /** Where uploaded files live. Only "local" exists until M10 adds S3-compatible storage (MinIO). */
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    /** Folder for the local driver, relative to the app folder unless absolute. Git-ignored. */
    STORAGE_LOCAL_DIR: z.string().min(1).default(".data/blobs"),
    /**
     * Virus scan of uploads until ClamAV arrives (M10). "pending" (default) leaves uploads PENDING, so nobody
     * can open or publish them; "assume-clean" marks them CLEAN at once, for local and staging demos only.
     */
    UPLOAD_SCAN: z
      .enum(["pending", "assume-clean", ""])
      .optional()
      .transform((value): "pending" | "assume-clean" =>
        value === "assume-clean" ? value : "pending",
      ),
  })
  .transform(({ APP_ENV, ...rest }) => ({
    ...rest,
    APP_ENV:
      APP_ENV ??
      (rest.NODE_ENV === "production" ? "production" : "development"),
  }))
  .superRefine((env, ctx) => {
    if (env.AUTH_SKIP_SECOND_STEP && env.APP_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_SKIP_SECOND_STEP"],
        message:
          "the two-step switch is for local and staging demos only and cannot be used when APP_ENV is production",
      });
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

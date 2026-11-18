// Runs once when a server starts. Validating the environment here makes a misconfigured server refuse to
// start, instead of failing on the first request. In particular, AUTH_SKIP_SECOND_STEP=true with
// APP_ENV=production stops the server (see src/lib/env.ts).

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // The build does not need runtime secrets.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { getEnv } = await import("@/lib/env");
  let env;
  try {
    env = getEnv();
  } catch (error) {
    console.error(`[startup] Refusing to start: ${(error as Error).message}`);
    // Next.js only logs a failing instrumentation hook and carries on, so stop the process here.
    // Tests call register() directly and check the error instead.
    if (!process.env.VITEST) process.exit(1);
    throw error;
  }
  if (env.AUTH_SKIP_SECOND_STEP) {
    console.warn(
      `[auth] Two-step verification is OPTIONAL (AUTH_SKIP_SECOND_STEP=true, APP_ENV=${env.APP_ENV}). Demo use only.`,
    );
  }
  if (env.UPLOAD_SCAN === "assume-clean") {
    console.warn(
      `[storage] Uploads are NOT virus scanned and are marked clean at once (UPLOAD_SCAN=assume-clean, APP_ENV=${env.APP_ENV}). Demo use only.`,
    );
  }
}

// Start-up checks for the Node.js runtime (see instrumentation.ts).

import { getEnv } from "@/lib/env";

export async function registerNode(): Promise<void> {
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
  if (env.AUTH_SECOND_STEP === "none") {
    console.info(
      `[auth] Sign-in asks for email and password only (AUTH_SECOND_STEP=none, PLAN 0a.3).`,
    );
  }
  if (env.UPLOAD_SCAN === "assume-clean") {
    console.warn(
      `[storage] Uploads are NOT virus scanned and are marked clean at once (UPLOAD_SCAN=assume-clean, APP_ENV=${env.APP_ENV}). Demo use only.`,
    );
  }
  if (env.UPLOAD_SCAN === "pending" && env.APP_ENV !== "development") {
    console.warn(
      `[storage] UPLOAD_SCAN=pending: uploads are not scanned and stay hidden until scanned. Set UPLOAD_SCAN=clamav.`,
    );
  }
  if (env.UPLOAD_SCAN === "clamav" && !process.env.VITEST) {
    const { startScanSweeper } = await import("@/lib/storage/scanner");
    startScanSweeper();
  }
}

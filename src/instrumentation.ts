// Runs once when a server starts. Validating the environment here makes a misconfigured server refuse to
// start, instead of failing on the first request. In particular, UPLOAD_SCAN=assume-clean with
// APP_ENV=production stops the server (see src/lib/env.ts). The work itself is in instrumentation-node.ts,
// imported only in the Node.js runtime so that no Node-only API reaches the Edge build.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // The build does not need runtime secrets.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { registerNode } = await import("./instrumentation-node");
  await registerNode();
}

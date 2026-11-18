// Virus scan seam (PLAN section 4: ClamAV before a file is visible). Pure.
// Until ClamAV exists (M10), UPLOAD_SCAN decides what an upload's scan status starts as:
// "pending" keeps it PENDING (nobody can open or publish it), "assume-clean" marks it CLEAN at once and the audit
// trail records that no scanner ran. env.ts refuses "assume-clean" when APP_ENV is production.

import { ScanStatus } from "@/generated/prisma/enums";

export type ScanMode = "pending" | "assume-clean";

export interface ScanOutcome {
  scanStatus: ScanStatus;
  /** Recorded in the audit event, so it is always clear whether a real scanner checked the file. */
  scanner: "none" | "pending";
}

export function initialScan(mode: ScanMode): ScanOutcome {
  return mode === "assume-clean"
    ? { scanStatus: ScanStatus.CLEAN, scanner: "none" }
    : { scanStatus: ScanStatus.PENDING, scanner: "pending" };
}

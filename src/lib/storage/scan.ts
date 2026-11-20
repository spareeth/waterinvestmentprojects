// Virus scan seam (PLAN section 5: ClamAV before a file is visible). Pure.
// UPLOAD_SCAN decides what an upload's scan status starts as:
// - "clamav" (production, M8): PENDING, then src/lib/storage/scanner.ts sends the file to clamd right after the
//   upload and marks it CLEAN or INFECTED; anything clamd could not take yet is retried every minute.
// - "pending": PENDING with no scanner, so nobody can open or publish the file.
// - "assume-clean": CLEAN at once and the audit trail records that no scanner ran. env.ts refuses it when
//   APP_ENV is production.

import { ScanStatus } from "@/generated/prisma/enums";

export type ScanMode = "pending" | "assume-clean" | "clamav";

export interface ScanOutcome {
  scanStatus: ScanStatus;
  /** Recorded in the audit event, so it is always clear whether a real scanner checked the file. */
  scanner: "none" | "pending" | "clamav-queued";
}

export function initialScan(mode: ScanMode): ScanOutcome {
  if (mode === "assume-clean") {
    return { scanStatus: ScanStatus.CLEAN, scanner: "none" };
  }
  if (mode === "clamav") {
    return { scanStatus: ScanStatus.PENDING, scanner: "clamav-queued" };
  }
  return { scanStatus: ScanStatus.PENDING, scanner: "pending" };
}

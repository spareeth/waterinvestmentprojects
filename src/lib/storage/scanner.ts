import "server-only";
import { ScanStatus } from "@/generated/prisma/enums";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { notifySummitTeam } from "@/lib/mail";
import {
  type ClamdOptions,
  type ClamdVerdict,
  ClamdReplyError,
  ClamdUnavailableError,
  clamdScan,
  type ScanSource,
} from "./clamd";
import { type BlobStore, getBlobStore } from "./index";

// M8: background virus scan with ClamAV (UPLOAD_SCAN=clamav). Uploads are stored as PENDING; this sweep sends
// each PENDING file to clamd and records CLEAN or INFECTED (or FAILED when clamd refuses the file or the file is
// missing). A file is visible and publishable only when CLEAN (src/lib/authz/documents.ts). When clamd is not
// reachable (for example while it loads its signatures after a restart), files simply stay PENDING and the next
// sweep tries again. The uploader is never kept waiting for the scan.

export const SCAN_AUDIT = { DOCUMENT_SCAN: "document.scan" } as const;

export interface SweepResult {
  scanned: number;
  clean: number;
  infected: number;
  failed: number;
  /** True when clamd could not be reached; the remaining files stay PENDING. */
  unavailable: boolean;
}

export interface SweepOptions {
  limit?: number;
  /** Only these documents (tests). */
  documentIds?: string[];
  store?: BlobStore;
  clamd?: ClamdOptions;
  /** Replaceable in tests. */
  scan?: (source: ScanSource, options: ClamdOptions) => Promise<ClamdVerdict>;
  notify?: boolean;
}

async function record(
  documentId: string,
  projectId: string,
  scanStatus: ScanStatus,
  metadata: Record<string, string>,
): Promise<boolean> {
  // Only a file that is still PENDING changes, so two sweeps can never both record a result.
  const changed = await db.$transaction(async (tx) => {
    const { count } = await tx.document.updateMany({
      where: { id: documentId, scanStatus: ScanStatus.PENDING },
      data: { scanStatus },
    });
    if (count === 1) {
      await writeAudit(
        {
          actorId: null,
          action: SCAN_AUDIT.DOCUMENT_SCAN,
          entityType: "Document",
          entityId: documentId,
          metadata: { projectId, scanStatus, scanner: "clamav", ...metadata },
        },
        tx,
      );
    }
    return count === 1;
  });
  return changed;
}

/** Scans every PENDING file (oldest first, up to `limit`). Never throws for one bad file. */
export async function scanPendingDocuments(
  options: SweepOptions = {},
): Promise<SweepResult> {
  const env = getEnv();
  const result: SweepResult = {
    scanned: 0,
    clean: 0,
    infected: 0,
    failed: 0,
    unavailable: false,
  };
  const clamd = options.clamd ?? {
    host: env.CLAMAV_HOST,
    port: env.CLAMAV_PORT,
  };
  const scan = options.scan ?? clamdScan;
  const store = options.store ?? getBlobStore();

  const pending = await db.document.findMany({
    where: {
      scanStatus: ScanStatus.PENDING,
      ...(options.documentIds ? { id: { in: options.documentIds } } : {}),
    },
    orderBy: { uploadedAt: "asc" },
    take: options.limit ?? 50,
    select: { id: true, projectId: true, blobKey: true, filename: true },
  });

  for (const doc of pending) {
    const file = await store.get(doc.blobKey);
    if (!file) {
      if (
        await record(doc.id, doc.projectId, ScanStatus.FAILED, {
          reason: "file_missing",
        })
      ) {
        result.failed++;
      }
      continue;
    }
    let verdict: ClamdVerdict;
    try {
      verdict = await scan(file.stream, clamd);
    } catch (error) {
      await file.stream.cancel().catch(() => undefined);
      if (error instanceof ClamdReplyError) {
        if (
          await record(doc.id, doc.projectId, ScanStatus.FAILED, {
            reason: "clamd_refused",
            reply: error.reply.slice(0, 200),
          })
        ) {
          result.failed++;
        }
        continue;
      }
      if (!(error instanceof ClamdUnavailableError)) {
        console.error("[scan] Unexpected error while scanning", error);
      }
      result.unavailable = true;
      break;
    }
    result.scanned++;
    if (verdict.status === "clean") {
      if (await record(doc.id, doc.projectId, ScanStatus.CLEAN, {})) {
        result.clean++;
      }
      continue;
    }
    if (
      await record(doc.id, doc.projectId, ScanStatus.INFECTED, {
        signature: verdict.signature,
      })
    ) {
      result.infected++;
      console.warn(
        `[scan] Document ${doc.id} is infected (${verdict.signature}); it stays blocked.`,
      );
      if (options.notify !== false) {
        await notifySummitTeam(
          "document.infected",
          {
            subject: "An uploaded teaser failed the virus scan",
            text: [
              "The virus scanner found a problem in an uploaded teaser. The file is blocked: nobody can open,",
              "download or publish it.",
              "",
              `File: ${doc.filename}`,
              `Document id: ${doc.id}`,
              `Project id: ${doc.projectId}`,
              `Scanner result: ${verdict.signature}`,
              "",
              "Please ask the country to send a clean copy.",
            ].join("\n"),
          },
          { entityType: "Document", entityId: doc.id },
        );
      }
    }
  }
  return result;
}

let running: Promise<void> | null = null;
let reportedUnavailable = false;

/**
 * Starts a sweep unless one is running. Safe to call from anywhere (after an upload commits, and on a timer);
 * does nothing unless UPLOAD_SCAN is "clamav". Never throws.
 */
export function requestScanSweep(): void {
  let mode: string;
  try {
    mode = getEnv().UPLOAD_SCAN;
  } catch {
    return;
  }
  if (mode !== "clamav" || running) return;
  running = scanPendingDocuments()
    .then((result) => {
      if (result.unavailable && !reportedUnavailable) {
        console.warn(
          "[scan] ClamAV is not reachable yet; uploads stay pending and are scanned once it answers.",
        );
      }
      if (!result.unavailable && reportedUnavailable) {
        console.info("[scan] ClamAV is reachable again.");
      }
      reportedUnavailable = result.unavailable;
      if (result.scanned > 0 || result.failed > 0) {
        console.info(
          `[scan] Scanned ${result.scanned} file(s): ${result.clean} clean, ${result.infected} infected, ${result.failed} failed.`,
        );
      }
    })
    .catch((error) => console.error("[scan] Sweep failed", error))
    .finally(() => {
      running = null;
    });
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Called once at server start: scans what is pending now, then every SCAN_SWEEP_SECONDS. */
export function startScanSweeper(): void {
  const env = getEnv();
  if (env.UPLOAD_SCAN !== "clamav" || timer) return;
  console.info(
    `[scan] Uploads are virus scanned by ClamAV at ${env.CLAMAV_HOST}:${env.CLAMAV_PORT}.`,
  );
  requestScanSweep();
  timer = setInterval(requestScanSweep, env.SCAN_SWEEP_SECONDS * 1000);
  timer.unref();
}

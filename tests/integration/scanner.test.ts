// The background virus scan (M8, UPLOAD_SCAN=clamav) against real PostgreSQL, with a fake scanner: a PENDING
// teaser becomes CLEAN or INFECTED with an audit event; a missing file becomes FAILED; when clamd is unreachable
// nothing changes and the files stay PENDING for the next sweep; a file already scanned is never scanned twice.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DocumentKind, ScanStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { LocalBlobStore } from "@/lib/storage";
import {
  ClamdUnavailableError,
  type ClamdVerdict,
  type ScanSource,
} from "@/lib/storage/clamd";
import { scanPendingDocuments } from "@/lib/storage/scanner";
import { COUNTRY_ID, cleanUp, ensureCountry } from "./helpers";

const IDS = {
  submission: "it-scan-submission",
  project: "it-scan-project",
  clean: "it-scan-doc-clean",
  infected: "it-scan-doc-infected",
  missing: "it-scan-doc-missing",
};
const clamd = { host: "127.0.0.1", port: 1 };

let blobDir: string;
let store: LocalBlobStore;

async function fakeScan(source: ScanSource): Promise<ClamdVerdict> {
  const bytes = Buffer.from(
    await new Response(source as ReadableStream<Uint8Array>).arrayBuffer(),
  );
  return bytes.includes("VIRUS")
    ? { status: "infected", signature: "Fake.Test.Signature" }
    : { status: "clean" };
}

async function addDocument(id: string, content: string | null) {
  const blobKey = `it-scan/${id}.pdf`;
  if (content !== null) await store.put(blobKey, Buffer.from(content));
  await db.document.create({
    data: {
      id,
      projectId: IDS.project,
      submissionId: IDS.submission,
      kind: DocumentKind.TEASER,
      filename: `${id}.pdf`,
      blobKey,
      sha256: "0".repeat(64),
      sizeBytes: content?.length ?? 0,
      scanStatus: ScanStatus.PENDING,
    },
  });
}

async function statusOf(id: string) {
  return (await db.document.findUniqueOrThrow({ where: { id } })).scanStatus;
}

beforeAll(async () => {
  await cleanUp();
  await ensureCountry();
  blobDir = await mkdtemp(path.join(tmpdir(), "scan-it-"));
  store = new LocalBlobStore(blobDir);
  await db.submission.create({
    data: {
      id: IDS.submission,
      countryId: COUNTRY_ID,
      uploaderName: "Scan Test",
      uploaderEmail: "scan@it.example",
      ackTextVersion: "test",
      ackAcceptedAt: new Date(),
    },
  });
  await db.project.create({
    data: {
      id: IDS.project,
      countryId: COUNTRY_ID,
      submissionId: IDS.submission,
      title: "Scan test project",
      sector: "Desalination",
    },
  });
  await addDocument(IDS.clean, "%PDF-1.7 a clean teaser");
  await addDocument(IDS.infected, "%PDF-1.7 VIRUS inside");
  await addDocument(IDS.missing, null);
});

afterAll(async () => {
  await cleanUp();
  await rm(blobDir, { recursive: true, force: true });
});

describe("background virus scan", () => {
  const documentIds = [IDS.clean, IDS.infected, IDS.missing];

  it("leaves everything PENDING while clamd is unreachable", async () => {
    const result = await scanPendingDocuments({
      documentIds,
      store,
      clamd,
      notify: false,
      scan: async () => {
        throw new ClamdUnavailableError("down");
      },
    });
    expect(result.unavailable).toBe(true);
    expect(await statusOf(IDS.clean)).toBe(ScanStatus.PENDING);
    expect(await statusOf(IDS.infected)).toBe(ScanStatus.PENDING);
  });

  it("marks files CLEAN, INFECTED or FAILED and audits each result", async () => {
    const result = await scanPendingDocuments({
      documentIds,
      store,
      clamd,
      notify: false,
      scan: fakeScan,
    });
    expect(result).toMatchObject({
      scanned: 2,
      clean: 1,
      infected: 1,
      failed: 1,
      unavailable: false,
    });
    expect(await statusOf(IDS.clean)).toBe(ScanStatus.CLEAN);
    expect(await statusOf(IDS.infected)).toBe(ScanStatus.INFECTED);
    expect(await statusOf(IDS.missing)).toBe(ScanStatus.FAILED);

    const audits = await db.auditEvent.findMany({
      where: { action: "document.scan", entityId: { in: documentIds } },
    });
    expect(audits).toHaveLength(3);
    const infected = audits.find((a) => a.entityId === IDS.infected);
    expect(infected?.metadata).toMatchObject({
      scanStatus: ScanStatus.INFECTED,
      scanner: "clamav",
      signature: "Fake.Test.Signature",
    });
  });

  it("never scans a file twice", async () => {
    let calls = 0;
    const result = await scanPendingDocuments({
      documentIds,
      store,
      clamd,
      notify: false,
      scan: async (source) => {
        calls++;
        return fakeScan(source);
      },
    });
    expect(calls).toBe(0);
    expect(result.scanned).toBe(0);
  });
});

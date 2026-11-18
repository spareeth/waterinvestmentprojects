import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  CountryStatus,
  DocumentKind,
  ProjectStatus,
} from "@/generated/prisma/enums";
import { type RequestMeta, writeAudit } from "@/lib/audit";
import {
  canListSubmissions,
  canManageUploadLinks,
  generateUploadToken,
  hashUploadToken,
  resolveUploadLink,
  submissionCountryId,
  submissionWhere,
  type UploadLinkState,
  uploadLinkState,
  uploadLinkWhere,
  type Viewer,
} from "@/lib/authz";
import { appConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { type Mailer, notifySummitTeam, sendMail } from "@/lib/mail";
import { type BlobStore, getBlobStore, submissionBlobKey } from "@/lib/storage";
import { initialScan, type ScanMode } from "@/lib/storage/scan";
import {
  cleanFilename,
  detectTeaserType,
  submissionFileProblem,
  type TeaserFileType,
} from "@/lib/workspace/teaser-file";
import {
  type SubmissionMailFacts,
  summitSubmissionNotice,
  uploaderConfirmationEmail,
} from "./emails";
import { FIELD_MESSAGES, SubmissionError } from "./errors";
import {
  isSubmissionSector,
  MAX_SUBMISSION_BYTES,
  MAX_TEASERS_PER_SUBMISSION,
  parseUploader,
  projectNameFromFilename,
  SUBMISSION_FIELDS,
} from "./input";

// Teaser upload link (M0, PLAN v0.3 F0).
// - Public side: a government uploader opens /submit/<token> and sends teasers. The token is the only
//   authorisation; resolveUploadLink() in the policy module turns it into a link, and the link fixes the country.
// - Admin side: Summit and platform admins create, replace and revoke links and list every submission. Each
//   function takes the Viewer and checks it through src/lib/authz.
// Every write and its AuditEvent happen in one transaction. Server actions are thin wrappers; the integration
// tests call these functions directly.
// After each submission (user decision, 18 Nov): a confirmation email to the uploader and a notice to the Summit
// team mailbox, both from the Summit mailbox through src/lib/mail. The confirmation page and the admin counts
// ("new" markers) stay, so nothing depends on email arriving.

export const SUBMISSION_AUDIT = {
  LINK_CREATE: "upload_link.create",
  LINK_REVOKE: "upload_link.revoke",
  LINK_OPEN: "upload_link.open",
  LINK_REFUSED: "upload_link.refused",
  SUBMISSION_CREATE: "submission.create",
  SUBMISSION_LIST: "submission.list",
  PROJECT_CREATE: "project.create",
  DOCUMENT_UPLOAD: "document.upload",
  DOCUMENT_SCAN: "document.scan",
} as const;

/** Submissions this recent are marked "new" on the admin pages. */
export const NEW_SUBMISSION_HOURS = 24;

/** Upload links last at most this long (the upload window is 18 to 23 Nov; links default to 30 Nov). */
export const MAX_LINK_DAYS = 120;

export { SubmissionError, type SubmissionErrorCode } from "./errors";

export interface SubmissionOptions {
  meta?: RequestMeta;
  now?: Date;
  /** Defaults to the configured store (STORAGE_DRIVER). Tests pass a store in a temporary folder. */
  store?: BlobStore;
  /** Defaults to UPLOAD_SCAN. */
  scanMode?: ScanMode;
  /** Defaults to the configured mailer (MAIL_DRIVER). */
  mailer?: Mailer;
  /** Defaults to ADMIN_NOTIFY_EMAIL. */
  summitEmails?: string[];
}

// ---------------------------------------------------------------------------
// Public side: the upload link
// ---------------------------------------------------------------------------

export interface UploadLinkPage {
  state: UploadLinkState;
  /** The link's country; null on the generic link (and when the link does not work). */
  country: { id: string; name: string } | null;
  /** Generic link only: the countries the uploader can choose from. */
  countries: { id: string; name: string }[];
  expiresAt: Date | null;
}

/** What /submit/<token> shows. Records upload_link.open, or upload_link.refused for a link that does not work. */
export async function openUploadLink(
  token: string,
  { meta, now = new Date() }: SubmissionOptions = {},
): Promise<UploadLinkPage> {
  const resolved = await resolveUploadLink(token, { now });
  if (resolved.state !== "valid" || !resolved.link) {
    await writeAudit({
      actorId: null,
      action: SUBMISSION_AUDIT.LINK_REFUSED,
      entityType: "UploadLink",
      meta,
      metadata: { state: resolved.state, step: "open" },
    });
    return {
      state: resolved.state,
      country: null,
      countries: [],
      expiresAt: null,
    };
  }
  const { link } = resolved;
  await writeAudit({
    actorId: null,
    action: SUBMISSION_AUDIT.LINK_OPEN,
    entityType: "UploadLink",
    entityId: link.id,
    meta,
    metadata: { countryId: link.countryId },
  });
  const countries =
    link.countryId === null
      ? await db.country.findMany({
          where: { status: CountryStatus.ACTIVE },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [];
  return {
    state: "valid",
    country: link.country,
    countries,
    expiresAt: link.expiresAt,
  };
}

export interface SubmissionFile {
  /** The name the browser sent (display and download name only). */
  name: string;
  bytes: Uint8Array;
}

export interface SubmissionInput {
  /** Generic link only; ignored on a country link. */
  countryId?: string | null;
  uploaderName: string;
  uploaderEmail: string;
  acknowledged: boolean;
  teasers: { sector: string; file: SubmissionFile | null }[];
}

export interface SubmissionReceipt {
  submissionId: string;
  countryId: string;
  countryName: string;
  /** As stored (trimmed; email in lower case). */
  uploaderName: string;
  uploaderEmail: string;
  acceptedAt: Date;
  projectIds: string[];
  documentIds: string[];
  files: { filename: string; sector: string }[];
  /** True when the confirmation email really left the server (smtp driver accepted it). */
  emailSent: boolean;
}

interface CheckedTeaser {
  sector: string;
  type: TeaserFileType;
  file: SubmissionFile;
}

/**
 * Stores one government submission: a Submission with the single acknowledgement, and per teaser a DRAFT
 * project with its first teaser version. Files are written first under fresh keys and removed again if the
 * transaction fails. After the commit, a confirmation email goes to the uploader and a notice to the Summit team
 * mailbox; an email failure is audited (mail.failed) and never undoes the submission.
 */
export async function submitTeasers(
  token: string,
  input: SubmissionInput,
  options: SubmissionOptions = {},
): Promise<SubmissionReceipt> {
  const { meta, now = new Date() } = options;
  const resolved = await resolveUploadLink(token, { now });
  if (resolved.state !== "valid" || !resolved.link) {
    await writeAudit({
      actorId: null,
      action: SUBMISSION_AUDIT.LINK_REFUSED,
      entityType: "UploadLink",
      meta,
      metadata: { state: resolved.state, step: "submit" },
    });
    throw new SubmissionError(
      resolved.state === "expired" ? "link_expired" : "link_invalid",
    );
  }
  const link = resolved.link;
  const fieldErrors: Record<string, string> = {};

  // The country comes from the link; only the generic link lets the uploader choose (an ACTIVE country).
  const countryId = submissionCountryId(link, input.countryId);
  let country = link.country;
  if (link.countryId === null) {
    country = countryId
      ? await db.country.findFirst({
          where: { id: countryId, status: CountryStatus.ACTIVE },
          select: { id: true, name: true },
        })
      : null;
    if (!country)
      fieldErrors[SUBMISSION_FIELDS.countryId] = FIELD_MESSAGES.countryId;
  }

  const uploader = parseUploader(input);
  if (!uploader.ok) Object.assign(fieldErrors, uploader.fieldErrors);
  if (!input.acknowledged) {
    fieldErrors[SUBMISSION_FIELDS.acknowledge] = FIELD_MESSAGES.acknowledge;
  }

  const checked: CheckedTeaser[] = [];
  if (input.teasers.length === 0)
    fieldErrors.teasers = FIELD_MESSAGES.noTeasers;
  if (input.teasers.length > MAX_TEASERS_PER_SUBMISSION) {
    fieldErrors.teasers = FIELD_MESSAGES.tooManyTeasers;
  }
  let totalBytes = 0;
  input.teasers.slice(0, MAX_TEASERS_PER_SUBMISSION).forEach((teaser, i) => {
    if (!isSubmissionSector(teaser.sector)) {
      fieldErrors[SUBMISSION_FIELDS.sector(i)] = FIELD_MESSAGES.sector;
    }
    const problem = teaser.file
      ? submissionFileProblem(teaser.file)
      : "file_missing";
    const type = teaser.file ? detectTeaserType(teaser.file) : null;
    if (problem || !teaser.file || !type) {
      fieldErrors[SUBMISSION_FIELDS.teaser(i)] =
        FIELD_MESSAGES[problem ?? "file_wrong_type"];
      return;
    }
    totalBytes += teaser.file.bytes.byteLength;
    checked.push({ sector: teaser.sector, type, file: teaser.file });
  });
  if (totalBytes > MAX_SUBMISSION_BYTES) {
    fieldErrors.teasers = FIELD_MESSAGES.totalTooLarge;
  }
  if (Object.keys(fieldErrors).length > 0 || !uploader.ok || !country) {
    throw new SubmissionError("invalid", fieldErrors);
  }
  const target = country;
  const { uploaderName, uploaderEmail } = uploader.data;

  const blobs = options.store ?? getBlobStore();
  const scan = initialScan(options.scanMode ?? getEnv().UPLOAD_SCAN);
  const ackTextVersion = appConfig.uploadAcknowledgement.version;
  const uploadId = randomUUID();
  const stored: (CheckedTeaser & {
    blobKey: string;
    sha256: string;
    filename: string;
  })[] = [];

  let receipt: Omit<SubmissionReceipt, "emailSent">;
  try {
    for (const teaser of checked) {
      const blobKey = submissionBlobKey(uploadId, randomUUID(), teaser.type);
      await blobs.put(blobKey, teaser.file.bytes);
      stored.push({
        ...teaser,
        blobKey,
        sha256: createHash("sha256").update(teaser.file.bytes).digest("hex"),
        filename: cleanFilename(teaser.file.name, teaser.type),
      });
    }

    receipt = await db.$transaction(async (tx) => {
      // The link may have been revoked while the files were being stored.
      const fresh = await tx.uploadLink.findUnique({
        where: { id: link.id },
        select: {
          countryId: true,
          expiresAt: true,
          revokedAt: true,
          country: { select: { status: true } },
        },
      });
      const state = uploadLinkState(fresh, now);
      if (state !== "valid") {
        throw new SubmissionError(
          state === "expired" ? "link_expired" : "link_invalid",
        );
      }

      const submission = await tx.submission.create({
        data: {
          countryId: target.id,
          uploadLinkId: link.id,
          uploaderName,
          uploaderEmail,
          ackTextVersion,
          ackAcceptedAt: now,
          ip: meta?.ip ?? null,
        },
        select: { id: true },
      });

      const projectIds: string[] = [];
      const documentIds: string[] = [];
      for (const teaser of stored) {
        const name = projectNameFromFilename(teaser.filename);
        const project = await tx.project.create({
          data: {
            countryId: target.id,
            submissionId: submission.id,
            name,
            sector: teaser.sector,
            status: ProjectStatus.DRAFT,
          },
          select: { id: true },
        });
        const doc = await tx.document.create({
          data: {
            projectId: project.id,
            kind: DocumentKind.TEASER,
            title: "Project teaser",
            filename: teaser.filename,
            version: 1,
            // PLAN v0.3: downloads allowed by default.
            allowDownload: true,
            blobKey: teaser.blobKey,
            sha256: teaser.sha256,
            sizeBytes: teaser.file.bytes.byteLength,
            scanStatus: scan.scanStatus,
            uploadedById: null,
          },
          select: { id: true },
        });
        projectIds.push(project.id);
        documentIds.push(doc.id);
        await writeAudit(
          {
            actorId: null,
            action: SUBMISSION_AUDIT.PROJECT_CREATE,
            entityType: "Project",
            entityId: project.id,
            meta,
            metadata: {
              countryId: target.id,
              submissionId: submission.id,
              name,
              sector: teaser.sector,
              source: "upload_link",
            },
          },
          tx,
        );
        await writeAudit(
          {
            actorId: null,
            action: SUBMISSION_AUDIT.DOCUMENT_UPLOAD,
            entityType: "Document",
            entityId: doc.id,
            meta,
            metadata: {
              projectId: project.id,
              submissionId: submission.id,
              kind: DocumentKind.TEASER,
              version: 1,
              filename: teaser.filename,
              fileType: teaser.type,
              sha256: teaser.sha256,
              sizeBytes: teaser.file.bytes.byteLength,
              source: "upload_link",
            },
          },
          tx,
        );
        await writeAudit(
          {
            actorId: null,
            action: SUBMISSION_AUDIT.DOCUMENT_SCAN,
            entityType: "Document",
            entityId: doc.id,
            meta,
            metadata: { scanStatus: scan.scanStatus, scanner: scan.scanner },
          },
          tx,
        );
      }

      await writeAudit(
        {
          actorId: null,
          action: SUBMISSION_AUDIT.SUBMISSION_CREATE,
          entityType: "Submission",
          entityId: submission.id,
          meta,
          metadata: {
            countryId: target.id,
            uploadLinkId: link.id,
            genericLink: link.countryId === null,
            uploaderName,
            uploaderEmail,
            ackTextVersion,
            ackAcceptedAt: now.toISOString(),
            projectIds,
            documentIds,
          },
        },
        tx,
      );

      return {
        submissionId: submission.id,
        countryId: target.id,
        countryName: target.name,
        uploaderName,
        uploaderEmail,
        acceptedAt: now,
        projectIds,
        documentIds,
        files: stored.map((t) => ({ filename: t.filename, sector: t.sector })),
      };
    });
  } catch (error) {
    // Nothing points at the files any more: remove them so storage holds no orphans.
    await Promise.all(
      stored.map((t) => blobs.delete(t.blobKey).catch(() => undefined)),
    );
    throw error;
  }

  const facts: SubmissionMailFacts = {
    submissionId: receipt.submissionId,
    countryName: receipt.countryName,
    uploaderName,
    uploaderEmail,
    acceptedAt: receipt.acceptedAt,
    ackText: appConfig.uploadAcknowledgement.text,
    files: receipt.files,
  };
  const mailOptions = {
    mailer: options.mailer,
    meta,
    entityType: "Submission",
    entityId: receipt.submissionId,
  };
  const emailSent = await sendMail(
    "submission.uploader_confirmation",
    { to: [uploaderEmail], ...uploaderConfirmationEmail(facts) },
    mailOptions,
  );
  await notifySummitTeam(
    "submission.summit_notice",
    {
      ...summitSubmissionNotice(facts),
    },
    { ...mailOptions, recipients: options.summitEmails },
  );
  return { ...receipt, emailSent };
}

// ---------------------------------------------------------------------------
// Admin side: links
// ---------------------------------------------------------------------------

export interface CreatedUploadLink {
  id: string;
  /** The full URL with the token. Shown once; only the token's hash is stored. */
  url: string;
  countryName: string | null;
  expiresAt: Date;
}

export function uploadLinkUrl(token: string): string {
  return `${getEnv().APP_URL.replace(/\/+$/, "")}/submit/${token}`;
}

/**
 * Creates a link for one country (or the generic link when countryId is null). A country has at most one
 * working link: creating a new one revokes the previous one. Returns the URL, which is never shown again.
 */
export async function createUploadLink(
  viewer: Viewer,
  input: { countryId: string | null; expiresAt: Date },
  { meta, now = new Date() }: SubmissionOptions = {},
): Promise<CreatedUploadLink> {
  if (!canManageUploadLinks(viewer)) throw new SubmissionError("forbidden");
  const latest = new Date(now.getTime() + MAX_LINK_DAYS * 24 * 60 * 60 * 1000);
  if (
    Number.isNaN(input.expiresAt.getTime()) ||
    input.expiresAt.getTime() <= now.getTime() ||
    input.expiresAt.getTime() > latest.getTime()
  ) {
    throw new SubmissionError("invalid", {
      expiresAt: FIELD_MESSAGES.expiresAt,
    });
  }
  const token = generateUploadToken();
  const created = await db.$transaction(async (tx) => {
    const country = input.countryId
      ? await tx.country.findFirst({
          where: { id: input.countryId, status: CountryStatus.ACTIVE },
          select: { id: true, name: true },
        })
      : null;
    if (input.countryId && !country) {
      throw new SubmissionError("invalid", {
        countryId: FIELD_MESSAGES.countryId,
      });
    }
    const replaced = await tx.uploadLink.findMany({
      where: { countryId: input.countryId, revokedAt: null },
      select: { id: true },
    });
    if (replaced.length > 0) {
      await tx.uploadLink.updateMany({
        where: { id: { in: replaced.map((l) => l.id) } },
        data: { revokedAt: now },
      });
    }
    const link = await tx.uploadLink.create({
      data: {
        countryId: input.countryId,
        tokenHash: hashUploadToken(token),
        expiresAt: input.expiresAt,
        createdById: viewer.id,
      },
      select: { id: true, expiresAt: true },
    });
    for (const old of replaced) {
      await writeAudit(
        {
          actorId: viewer.id,
          action: SUBMISSION_AUDIT.LINK_REVOKE,
          entityType: "UploadLink",
          entityId: old.id,
          meta,
          metadata: {
            countryId: input.countryId,
            reason: "replaced",
            replacedBy: link.id,
          },
        },
        tx,
      );
    }
    await writeAudit(
      {
        actorId: viewer.id,
        action: SUBMISSION_AUDIT.LINK_CREATE,
        entityType: "UploadLink",
        entityId: link.id,
        meta,
        metadata: {
          countryId: input.countryId,
          generic: input.countryId === null,
          expiresAt: link.expiresAt.toISOString(),
        },
      },
      tx,
    );
    return { link, country };
  });
  return {
    id: created.link.id,
    url: uploadLinkUrl(token),
    countryName: created.country?.name ?? null,
    expiresAt: created.link.expiresAt,
  };
}

/** Switches a link off for good. Revoking an already revoked link changes nothing. */
export async function revokeUploadLink(
  viewer: Viewer,
  linkId: string,
  { meta, now = new Date() }: SubmissionOptions = {},
): Promise<void> {
  if (!canManageUploadLinks(viewer)) throw new SubmissionError("forbidden");
  await db.$transaction(async (tx) => {
    const link = await tx.uploadLink.findFirst({
      where: { AND: [{ id: linkId }, uploadLinkWhere(viewer)] },
      select: { id: true, countryId: true, revokedAt: true },
    });
    if (!link) throw new SubmissionError("not_found");
    if (link.revokedAt) return;
    await tx.uploadLink.update({
      where: { id: link.id },
      data: { revokedAt: now },
    });
    await writeAudit(
      {
        actorId: viewer.id,
        action: SUBMISSION_AUDIT.LINK_REVOKE,
        entityType: "UploadLink",
        entityId: link.id,
        meta,
        metadata: { countryId: link.countryId, reason: "revoked" },
      },
      tx,
    );
  });
}

export interface UploadLinkSummary {
  id: string;
  state: UploadLinkState;
  expiresAt: Date;
  createdAt: Date;
  createdByName: string;
  submissions: number;
}

export interface UploadLinkOverview {
  countries: {
    id: string;
    name: string;
    /** The country's current (not revoked) link, or null. */
    link: UploadLinkSummary | null;
    submissions: number;
  }[];
  generic: UploadLinkSummary | null;
}

/** Every ACTIVE country with its current link and submission count, plus the generic link. Admins only. */
export async function getUploadLinkOverview(
  viewer: Viewer,
  { now = new Date() }: SubmissionOptions = {},
): Promise<UploadLinkOverview> {
  if (!canManageUploadLinks(viewer)) throw new SubmissionError("forbidden");
  const [countries, links] = await Promise.all([
    db.country.findMany({
      where: { status: CountryStatus.ACTIVE },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        _count: { select: { submissions: true } },
      },
    }),
    db.uploadLink.findMany({
      where: { AND: [uploadLinkWhere(viewer), { revokedAt: null }] },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        countryId: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
        createdBy: { select: { name: true } },
        country: { select: { status: true } },
        _count: { select: { submissions: true } },
      },
    }),
  ]);
  const summary = (l: (typeof links)[number]): UploadLinkSummary => ({
    id: l.id,
    state: uploadLinkState(l, now),
    expiresAt: l.expiresAt,
    createdAt: l.createdAt,
    createdByName: l.createdBy.name,
    submissions: l._count.submissions,
  });
  const byCountry = new Map<string, UploadLinkSummary>();
  let generic: UploadLinkSummary | null = null;
  for (const l of links) {
    if (l.countryId === null) generic ??= summary(l);
    else if (!byCountry.has(l.countryId))
      byCountry.set(l.countryId, summary(l));
  }
  return {
    countries: countries.map((c) => ({
      id: c.id,
      name: c.name,
      link: byCountry.get(c.id) ?? null,
      submissions: c._count.submissions,
    })),
    generic,
  };
}

// ---------------------------------------------------------------------------
// Admin side: submissions
// ---------------------------------------------------------------------------

/** Every submission, newest first, with its projects and teaser files. Admins only; records submission.list. */
export async function listSubmissions(
  viewer: Viewer,
  { meta }: SubmissionOptions = {},
) {
  if (!canListSubmissions(viewer)) throw new SubmissionError("forbidden");
  const submissions = await db.submission.findMany({
    where: submissionWhere(viewer),
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      uploaderName: true,
      uploaderEmail: true,
      ackTextVersion: true,
      ackAcceptedAt: true,
      createdAt: true,
      country: { select: { id: true, name: true } },
      uploadLink: { select: { countryId: true } },
      projects: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          sector: true,
          status: true,
          documents: {
            where: { kind: DocumentKind.TEASER },
            orderBy: { version: "asc" },
            select: {
              id: true,
              filename: true,
              version: true,
              sizeBytes: true,
              sha256: true,
              scanStatus: true,
            },
          },
        },
      },
    },
  });
  await writeAudit({
    actorId: viewer.id,
    action: SUBMISSION_AUDIT.SUBMISSION_LIST,
    entityType: "Submission",
    meta,
    metadata: { count: submissions.length },
  });
  return submissions;
}

export type SubmissionListItem = Awaited<
  ReturnType<typeof listSubmissions>
>[number];

export interface SubmissionCounts {
  submissions: number;
  teasers: number;
  /** Submissions in the last NEW_SUBMISSION_HOURS hours. */
  recent: number;
  /** Active countries with at least one submission, out of all active countries. */
  countriesWithSubmissions: number;
  activeCountries: number;
}

/**
 * The admin notification for now (no email): totals and how many submissions are new. Admins only; anyone else
 * gets zeros, because submissionWhere matches nothing for them.
 */
export async function getSubmissionCounts(
  viewer: Viewer,
  { now = new Date() }: SubmissionOptions = {},
): Promise<SubmissionCounts> {
  const where = submissionWhere(viewer);
  const since = new Date(now.getTime() - NEW_SUBMISSION_HOURS * 60 * 60 * 1000);
  const allowed = canListSubmissions(viewer);
  const [submissions, teasers, recent, countries, activeCountries] =
    await Promise.all([
      db.submission.count({ where }),
      db.project.count({
        where: { submissionId: { not: null }, submission: { is: where } },
      }),
      db.submission.count({
        where: { AND: [where, { createdAt: { gte: since } }] },
      }),
      db.submission.groupBy({
        by: ["countryId"],
        where: { AND: [where, { country: { status: CountryStatus.ACTIVE } }] },
      }),
      allowed
        ? db.country.count({ where: { status: CountryStatus.ACTIVE } })
        : Promise.resolve(0),
    ]);
  return {
    submissions,
    teasers,
    recent,
    countriesWithSubmissions: countries.length,
    activeCountries,
  };
}

/** True when a submission counts as new on the admin pages. */
export function isRecentSubmission(createdAt: Date, now: Date): boolean {
  return (
    now.getTime() - createdAt.getTime() <= NEW_SUBMISSION_HOURS * 60 * 60 * 1000
  );
}

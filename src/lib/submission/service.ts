import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import {
  CountryContactRole,
  CountryStatus,
  DocumentKind,
  ProjectStatus,
  UserRole,
} from "@/generated/prisma/enums";
import { type RequestMeta, writeAudit } from "@/lib/audit";
import {
  canListSubmissions,
  canManageUploadLinks,
  canSubmitFromWorkspace,
  generateUploadToken,
  hashUploadToken,
  ownCountryIds,
  type ResolvedUploadLink,
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
import { requestScanSweep } from "@/lib/storage/scanner";
import { factFields, type TeaserFacts } from "@/lib/teaser/facts";
import { teaserFactsFromFile } from "@/lib/teaser/file-text";
import { millionToUsd } from "@/lib/workspace/project-input";
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
  parseGovernmentOrganisation,
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
  CONTACT_CREATE: "country_contact.create",
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
  /** M11 (PLAN v0.4 0b.2): required job title. */
  uploaderJobTitle: string;
  /** "Represented government organisation". */
  governmentOrganisation: string;
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
  uploaderJobTitle: string;
  governmentOrganisation: string;
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
 * PLAN v0.3 section 3: the uploader email becomes the country's request-inbox contact unless WBG names another
 * focal point. Adds the uploader as a FOCAL_POINT CountryContact of the country, unless that address already is
 * one (an existing contact, for example named by WBG, is never changed). Returns the new contact id, or null.
 */
async function recordUploaderContact(
  tx: Prisma.TransactionClient,
  contact: {
    countryId: string;
    name: string;
    email: string;
    submissionId: string;
  },
  meta: RequestMeta | undefined,
  origin: { actorId: string | null; source: SubmissionOrigin } = {
    actorId: null,
    source: "upload_link",
  },
): Promise<string | null> {
  const email = contact.email.trim().toLowerCase();
  const role = CountryContactRole.FOCAL_POINT;
  // M2: link the contact to the portal account of this country with the same address, if there is one.
  const account = await tx.user.findFirst({
    where: {
      email,
      role: UserRole.COUNTRY,
      memberships: { some: { countryId: contact.countryId } },
    },
    select: { id: true },
  });
  // ON CONFLICT DO NOTHING: two submissions from the same person at once cannot fail on the unique key.
  const inserted = await tx.countryContact.createMany({
    data: [
      {
        countryId: contact.countryId,
        name: contact.name,
        email,
        role,
        userId: account?.id ?? null,
      },
    ],
    skipDuplicates: true,
  });
  if (inserted.count === 0) return null;
  const created = await tx.countryContact.findUniqueOrThrow({
    where: {
      countryId_email_role: { countryId: contact.countryId, email, role },
    },
    select: { id: true },
  });
  await writeAudit(
    {
      actorId: origin.actorId,
      action: SUBMISSION_AUDIT.CONTACT_CREATE,
      entityType: "CountryContact",
      entityId: created.id,
      meta,
      metadata: {
        countryId: contact.countryId,
        role,
        name: contact.name,
        email,
        source: origin.source,
        submissionId: contact.submissionId,
      },
    },
    tx,
  );
  return created.id;
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
  return storeSubmission({ kind: "link", link: resolved.link }, input, {
    ...options,
    now,
  });
}

/**
 * 22 Nov (user request): a country focal point adds teasers from My projects ("Add project"), with the same
 * form, checks, storage, audit and emails as the upload link. No link: the signed-in account authorises it, for
 * its own ACTIVE countries only (canSubmitFromWorkspace); the audit events name the account.
 */
export async function submitWorkspaceTeasers(
  viewer: Viewer,
  input: SubmissionInput,
  options: SubmissionOptions = {},
): Promise<SubmissionReceipt> {
  if (!canSubmitFromWorkspace(viewer)) throw new SubmissionError("forbidden");
  return storeSubmission({ kind: "workspace", viewer }, input, options);
}

/** Countries a focal point can send teasers for from My projects (own and ACTIVE). */
export async function listWorkspaceSubmissionCountries(
  viewer: Viewer,
): Promise<{ id: string; name: string }[]> {
  if (!canSubmitFromWorkspace(viewer)) return [];
  return db.country.findMany({
    where: { id: { in: ownCountryIds(viewer) }, status: CountryStatus.ACTIVE },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

type SubmissionOrigin = "upload_link" | "workspace";

type SubmissionSource =
  | { kind: "link"; link: NonNullable<ResolvedUploadLink["link"]> }
  | { kind: "workspace"; viewer: Viewer };

async function storeSubmission(
  source: SubmissionSource,
  input: SubmissionInput,
  options: SubmissionOptions,
): Promise<SubmissionReceipt> {
  const { meta, now = new Date() } = options;
  const link = source.kind === "link" ? source.link : null;
  const actorId = source.kind === "workspace" ? source.viewer.id : null;
  const origin: SubmissionOrigin =
    source.kind === "link" ? "upload_link" : "workspace";
  const fieldErrors: Record<string, string> = {};

  let country: { id: string; name: string } | null;
  if (source.kind === "link") {
    // The country comes from the link; only the generic link lets the uploader choose (an ACTIVE country).
    const countryId = submissionCountryId(source.link, input.countryId);
    country = source.link.country;
    if (source.link.countryId === null) {
      country = countryId
        ? await db.country.findFirst({
            where: { id: countryId, status: CountryStatus.ACTIVE },
            select: { id: true, name: true },
          })
        : null;
      if (!country)
        fieldErrors[SUBMISSION_FIELDS.countryId] = FIELD_MESSAGES.countryId;
    }
  } else {
    // My projects: one of the focal point's own ACTIVE countries; with only one, it needs no choosing.
    const viewer = source.viewer;
    const own = ownCountryIds(viewer);
    const requested =
      input.countryId?.trim() || (own.length === 1 ? own[0] : "");
    country =
      requested && canSubmitFromWorkspace(viewer, requested)
        ? await db.country.findFirst({
            where: { id: requested, status: CountryStatus.ACTIVE },
            select: { id: true, name: true },
          })
        : null;
    if (!country)
      fieldErrors[SUBMISSION_FIELDS.countryId] = FIELD_MESSAGES.countryId;
  }

  const uploader = parseUploader(input);
  if (!uploader.ok) Object.assign(fieldErrors, uploader.fieldErrors);
  const organisation = parseGovernmentOrganisation(
    input.governmentOrganisation ?? "",
  );
  if (!organisation.ok) {
    fieldErrors[SUBMISSION_FIELDS.governmentOrganisation] = organisation.error;
  }
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
  if (
    Object.keys(fieldErrors).length > 0 ||
    !uploader.ok ||
    !organisation.ok ||
    !country
  ) {
    throw new SubmissionError("invalid", fieldErrors);
  }
  const target = country;
  const { uploaderName, uploaderEmail, uploaderJobTitle } = uploader.data;
  const governmentOrganisation = organisation.value;

  const blobs = options.store ?? getBlobStore();
  const scanMode = options.scanMode ?? getEnv().UPLOAD_SCAN;
  const scan = initialScan(scanMode);
  const ackTextVersion = appConfig.uploadAcknowledgement.version;
  const uploadId = randomUUID();
  const stored: (CheckedTeaser & {
    blobKey: string;
    sha256: string;
    filename: string;
    /** Key facts read from a PDF teaser (22 Nov), to fill the new draft project. */
    facts: TeaserFacts;
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
        facts: await teaserFactsFromFile(teaser.file.bytes, teaser.type, [
          target.name,
        ]),
      });
    }

    receipt = await db.$transaction(async (tx) => {
      if (link) {
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
      } else {
        // The country may have been switched off while the files were being stored.
        const fresh = await tx.country.findUnique({
          where: { id: target.id },
          select: { status: true },
        });
        if (fresh?.status !== CountryStatus.ACTIVE) {
          throw new SubmissionError("forbidden");
        }
      }

      const submission = await tx.submission.create({
        data: {
          countryId: target.id,
          uploadLinkId: link?.id ?? null,
          uploaderName,
          uploaderEmail,
          uploaderJobTitle,
          governmentOrganisation,
          ackTextVersion,
          ackAcceptedAt: now,
          ip: meta?.ip ?? null,
        },
        select: { id: true },
      });

      const projectIds: string[] = [];
      const documentIds: string[] = [];
      for (const teaser of stored) {
        // The sector is the one chosen in the form; the rest may come from the teaser (an admin reviews it).
        const facts = teaser.facts;
        const title = facts.title ?? projectNameFromFilename(teaser.filename);
        const fromTeaser = factFields({ ...facts, sector: undefined });
        const project = await tx.project.create({
          data: {
            countryId: target.id,
            submissionId: submission.id,
            title,
            sector: teaser.sector,
            region: facts.region ?? null,
            pppModel: facts.pppModel ?? null,
            sizeMinUsd: millionToUsd(facts.sizeMinUsdMillion ?? null),
            sizeMaxUsd: millionToUsd(facts.sizeMaxUsdMillion ?? null),
            developmentStage: facts.developmentStage ?? null,
            status: ProjectStatus.DRAFT,
          },
          select: { id: true },
        });
        const doc = await tx.document.create({
          data: {
            projectId: project.id,
            submissionId: submission.id,
            kind: DocumentKind.TEASER,
            filename: teaser.filename,
            version: 1,
            // PLAN v0.3: downloads allowed by default.
            allowDownload: true,
            blobKey: teaser.blobKey,
            sha256: teaser.sha256,
            sizeBytes: teaser.file.bytes.byteLength,
            scanStatus: scan.scanStatus,
            uploadedById: actorId,
          },
          select: { id: true },
        });
        projectIds.push(project.id);
        documentIds.push(doc.id);
        await writeAudit(
          {
            actorId,
            action: SUBMISSION_AUDIT.PROJECT_CREATE,
            entityType: "Project",
            entityId: project.id,
            meta,
            metadata: {
              countryId: target.id,
              submissionId: submission.id,
              title,
              sector: teaser.sector,
              source: origin,
              fromTeaser,
            },
          },
          tx,
        );
        await writeAudit(
          {
            actorId,
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
              source: origin,
            },
          },
          tx,
        );
        await writeAudit(
          {
            actorId,
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
          actorId,
          action: SUBMISSION_AUDIT.SUBMISSION_CREATE,
          entityType: "Submission",
          entityId: submission.id,
          meta,
          metadata: {
            countryId: target.id,
            uploadLinkId: link?.id ?? null,
            genericLink: link ? link.countryId === null : false,
            source: origin,
            uploaderName,
            uploaderEmail,
            uploaderJobTitle,
            governmentOrganisation,
            ackTextVersion,
            ackAcceptedAt: now.toISOString(),
            projectIds,
            documentIds,
          },
        },
        tx,
      );

      await recordUploaderContact(
        tx,
        {
          countryId: target.id,
          name: uploaderName,
          email: uploaderEmail,
          submissionId: submission.id,
        },
        meta,
        { actorId, source: origin },
      );

      return {
        submissionId: submission.id,
        countryId: target.id,
        countryName: target.name,
        uploaderName,
        uploaderEmail,
        uploaderJobTitle,
        governmentOrganisation,
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
  // The files are committed: hand them to the virus scanner now (UPLOAD_SCAN=clamav) without waiting for it.
  if (scanMode === "clamav") requestScanSweep();

  const facts: SubmissionMailFacts = {
    submissionId: receipt.submissionId,
    countryName: receipt.countryName,
    uploaderName,
    uploaderEmail,
    uploaderJobTitle,
    governmentOrganisation,
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

export interface CreatedCountryLink {
  countryId: string;
  countryName: string;
  iso3: string;
  url: string;
  expiresAt: Date;
}

/**
 * M12 (PLAN v0.4 0b.10): a link for every ACTIVE country that has no working link yet (none, or only revoked or
 * expired ones), so the Summit team can send all countries their links in one go. Countries with a working link
 * are left alone. Each link is created (and audited) through createUploadLink; the URLs come back once, for the
 * admin to download as a CSV, and are never stored. An invalid date refuses before anything is created.
 */
export async function createMissingUploadLinks(
  viewer: Viewer,
  input: { expiresAt: Date },
  options: SubmissionOptions = {},
): Promise<CreatedCountryLink[]> {
  if (!canManageUploadLinks(viewer)) throw new SubmissionError("forbidden");
  const now = options.now ?? new Date();
  const countries = await db.country.findMany({
    where: {
      status: CountryStatus.ACTIVE,
      uploadLinks: { none: { revokedAt: null, expiresAt: { gt: now } } },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, iso3: true },
  });
  const created: CreatedCountryLink[] = [];
  for (const country of countries) {
    const link = await createUploadLink(
      viewer,
      { countryId: country.id, expiresAt: input.expiresAt },
      { ...options, now },
    );
    created.push({
      countryId: country.id,
      countryName: country.name,
      iso3: country.iso3,
      url: link.url,
      expiresAt: link.expiresAt,
    });
  }
  return created;
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
      uploaderJobTitle: true,
      governmentOrganisation: true,
      ackTextVersion: true,
      ackAcceptedAt: true,
      createdAt: true,
      country: { select: { id: true, name: true } },
      uploadLink: { select: { countryId: true } },
      // Every file this submission's consent covers (a workspace upload adds a version to an existing project).
      documents: {
        orderBy: [{ projectId: "asc" }, { version: "asc" }],
        select: {
          id: true,
          filename: true,
          version: true,
          sizeBytes: true,
          sha256: true,
          scanStatus: true,
          project: {
            select: { id: true, title: true, sector: true, status: true },
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
      db.document.count({
        where: { kind: DocumentKind.TEASER, submission: { is: where } },
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

import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { DocumentKind, ScanStatus } from "@/generated/prisma/enums";
import { type RequestMeta, writeAudit } from "@/lib/audit";
import { type Viewer } from "@/lib/authz";
import {
  adminProjectWhere,
  canExportKind,
  contactWhere,
} from "@/lib/authz/admin";
import { appConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { exportRequestsCsv } from "@/lib/requests/service";
import { type CsvValue, toCsv } from "@/lib/requests/csv";
import { type BlobStore, getBlobStore } from "@/lib/storage";
import { usdToMillion } from "@/lib/workspace/project-input";
import { CONTACT_ROLE_LABEL } from "./contacts-input";
import { AdminError, type ExportKind, exportAuditAction } from "./errors";
import { PROJECT_EXPORT_HEADER } from "./metadata-import";
import { createZip, type ZipEntry } from "./zip";

// Admin exports (M7, PLAN v0.3 F7 and 0.14). CSV through M5's toCsv (formula-injection guard, byte order mark,
// CRLF). Every export is checked by canExportKind in src/lib/authz/admin.ts and writes an export.<kind> audit event
// with the row count. The meeting request export is M5's (/inbox/export); the country ZIP includes it.
// Times are UTC (ISO 8601). No secrets: no password hashes, sessions, tokens or token hashes.

interface Options {
  meta?: RequestMeta;
}

export interface CsvExport {
  csv: string;
  rows: number;
}

async function audit(
  viewer: Viewer,
  kind: ExportKind,
  meta: RequestMeta | undefined,
  metadata: Prisma.InputJsonValue,
  entityId: string | null = null,
) {
  await writeAudit({
    actorId: viewer.id,
    action: exportAuditAction(kind),
    entityType: kind === "country" ? "Country" : "Export",
    entityId,
    meta,
    metadata,
  });
}

function guard(viewer: Viewer, kind: ExportKind) {
  if (!canExportKind(viewer, kind)) throw new AdminError("forbidden");
}

// ---------------------------------------------------------------------------
// Row builders, shared by the single exports and the country ZIP
// ---------------------------------------------------------------------------

async function projectRows(
  where: Prisma.ProjectWhereInput,
): Promise<CsvValue[][]> {
  const projects = await db.project.findMany({
    where,
    orderBy: [{ country: { name: "asc" } }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      sector: true,
      region: true,
      projectType: true,
      pppModel: true,
      sizeMinUsd: true,
      sizeMaxUsd: true,
      developmentStage: true,
      status: true,
      publishedAt: true,
      country: { select: { name: true, iso3: true } },
      documents: {
        where: { kind: DocumentKind.TEASER, supersededById: null },
        orderBy: { version: "desc" },
        take: 1,
        select: { filename: true, version: true },
      },
    },
  });
  return projects.map((p) => [
    p.id,
    p.country.name,
    p.country.iso3,
    p.title,
    p.sector,
    p.region,
    p.projectType,
    p.pppModel,
    p.sizeMinUsd === null ? null : usdToMillion(p.sizeMinUsd),
    p.sizeMaxUsd === null ? null : usdToMillion(p.sizeMaxUsd),
    p.developmentStage,
    p.status,
    p.publishedAt,
    p.documents[0]?.filename,
    p.documents[0]?.version,
  ]);
}

export const SUBMISSION_EXPORT_HEADER = [
  "submission_id",
  "submitted_at_utc",
  "country",
  "iso3",
  "source",
  "uploader_name",
  "uploader_email",
  "uploader_job_title",
  "government_organisation",
  "acknowledgement_version",
  "acknowledged_at_utc",
  "project_id",
  "project_title",
  "file_name",
  "file_version",
  "file_size_bytes",
  "file_sha256",
  "scan_status",
] as const;

async function submissionRows(
  where: Prisma.SubmissionWhereInput,
): Promise<CsvValue[][]> {
  const submissions = await db.submission.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      uploadLinkId: true,
      uploaderName: true,
      uploaderEmail: true,
      uploaderJobTitle: true,
      governmentOrganisation: true,
      ackTextVersion: true,
      ackAcceptedAt: true,
      country: { select: { name: true, iso3: true } },
      documents: {
        orderBy: [{ projectId: "asc" }, { version: "asc" }],
        select: {
          filename: true,
          version: true,
          sizeBytes: true,
          sha256: true,
          scanStatus: true,
          project: { select: { id: true, title: true } },
        },
      },
    },
  });
  return submissions.flatMap((s) => {
    const base: CsvValue[] = [
      s.id,
      s.createdAt,
      s.country.name,
      s.country.iso3,
      s.uploadLinkId ? "Upload link" : "Portal upload",
      s.uploaderName,
      s.uploaderEmail,
      s.uploaderJobTitle,
      s.governmentOrganisation,
      s.ackTextVersion,
      s.ackAcceptedAt,
    ];
    if (s.documents.length === 0)
      return [[...base, null, null, null, null, null, null, null]];
    return s.documents.map((d) => [
      ...base,
      d.project.id,
      d.project.title,
      d.filename,
      d.version,
      d.sizeBytes,
      d.sha256,
      d.scanStatus,
    ]);
  });
}

/** First four columns match the contacts import, so the export can be edited and imported again. */
export const CONTACT_EXPORT_HEADER = [
  "iso3",
  "name",
  "email",
  "role",
  "country",
  "account_email",
  "account_status",
] as const;

async function contactRows(
  where: Prisma.CountryContactWhereInput,
): Promise<CsvValue[][]> {
  const contacts = await db.countryContact.findMany({
    where,
    orderBy: [{ country: { name: "asc" } }, { role: "asc" }, { name: "asc" }],
    select: {
      name: true,
      email: true,
      role: true,
      country: { select: { name: true, iso3: true } },
      user: { select: { email: true, status: true } },
    },
  });
  return contacts.map((c) => [
    c.country.iso3,
    c.name,
    c.email,
    CONTACT_ROLE_LABEL[c.role],
    c.country.name,
    c.user?.email,
    c.user?.status,
  ]);
}

// ---------------------------------------------------------------------------
// Single exports
// ---------------------------------------------------------------------------

export async function exportProjectsCsv(
  viewer: Viewer,
  { meta }: Options = {},
): Promise<CsvExport> {
  guard(viewer, "projects");
  const rows = await projectRows(adminProjectWhere(viewer));
  await audit(viewer, "projects", meta, { rows: rows.length });
  return { csv: toCsv(PROJECT_EXPORT_HEADER, rows), rows: rows.length };
}

export async function exportSubmissionsCsv(
  viewer: Viewer,
  { meta }: Options = {},
): Promise<CsvExport> {
  guard(viewer, "submissions");
  const rows = await submissionRows({});
  await audit(viewer, "submissions", meta, { rows: rows.length });
  return { csv: toCsv(SUBMISSION_EXPORT_HEADER, rows), rows: rows.length };
}

export async function exportContactsCsv(
  viewer: Viewer,
  { meta }: Options = {},
): Promise<CsvExport> {
  guard(viewer, "contacts");
  const rows = await contactRows(contactWhere(viewer));
  await audit(viewer, "contacts", meta, { rows: rows.length });
  return { csv: toCsv(CONTACT_EXPORT_HEADER, rows), rows: rows.length };
}

export const ACCOUNT_EXPORT_HEADER = [
  "name",
  "email",
  "organisation",
  "job_title",
  "role",
  "status",
  "countries_iso3",
  "created_at_utc",
  "temporary_password_still_to_change",
  "investor_acknowledgement_version",
  "investor_acknowledged_at_utc",
] as const;

/** Accounts without any secret: no password, hash, session, authenticator or token. */
export async function exportAccountsCsv(
  viewer: Viewer,
  { meta }: Options = {},
): Promise<CsvExport> {
  guard(viewer, "accounts");
  const users = await db.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      name: true,
      email: true,
      organisation: true,
      jobTitle: true,
      role: true,
      status: true,
      createdAt: true,
      mustChangePassword: true,
      investorAckTextVersion: true,
      investorAckAcceptedAt: true,
      memberships: {
        orderBy: { country: { iso3: "asc" } },
        select: { country: { select: { iso3: true } } },
      },
    },
  });
  const rows = users.map((u) => [
    u.name,
    u.email,
    u.organisation,
    u.jobTitle,
    u.role,
    u.status,
    u.memberships.map((m) => m.country.iso3).join(";"),
    u.createdAt,
    u.mustChangePassword ? "yes" : "no",
    u.investorAckTextVersion,
    u.investorAckAcceptedAt,
  ]);
  await audit(viewer, "accounts", meta, { rows: rows.length });
  return { csv: toCsv(ACCOUNT_EXPORT_HEADER, rows), rows: rows.length };
}

export const AUDIT_EXPORT_HEADER = [
  "at_utc",
  "action",
  "actor_email",
  "entity_type",
  "entity_id",
  "ip",
  "user_agent",
  "metadata_json",
] as const;

export const AUDIT_EXPORT_MAX_ROWS = 200_000;

/** The audit trail (platform admins only, PLAN section 4). Newest last; capped, the cap is in the audit event. */
export async function exportAuditCsv(
  viewer: Viewer,
  { meta }: Options = {},
): Promise<CsvExport> {
  guard(viewer, "audit");
  const events = await db.auditEvent.findMany({
    orderBy: { at: "desc" },
    take: AUDIT_EXPORT_MAX_ROWS,
    select: {
      at: true,
      action: true,
      entityType: true,
      entityId: true,
      ip: true,
      userAgent: true,
      metadata: true,
      actor: { select: { email: true } },
    },
  });
  events.reverse();
  const rows = events.map((e) => [
    e.at,
    e.action,
    e.actor?.email,
    e.entityType,
    e.entityId,
    e.ip,
    e.userAgent,
    e.metadata === null ? null : JSON.stringify(e.metadata),
  ]);
  await audit(viewer, "audit", meta, {
    rows: rows.length,
    capped: rows.length === AUDIT_EXPORT_MAX_ROWS,
  });
  return { csv: toCsv(AUDIT_EXPORT_HEADER, rows), rows: rows.length };
}

// ---------------------------------------------------------------------------
// One country, everything (PLAN 0.14: clean export per country, for handing data back or retiring)
// ---------------------------------------------------------------------------

/** Teaser bytes kept in memory while the ZIP is built. */
export const COUNTRY_EXPORT_MAX_BYTES = 1_500_000_000;

async function readAll(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

/** "Lake Pumping Station" v2 "teaser.pdf" -> "Lake Pumping Station/v2 teaser.pdf". */
function teaserPath(title: string, version: number, filename: string): string {
  const folder = title.replace(/[/\\]/g, "-").slice(0, 80);
  return `teasers/${folder}/v${version} ${filename}`;
}

export interface CountryExport {
  filename: string;
  zip: Uint8Array;
  files: number;
}

/**
 * Everything the portal holds for one country, as a ZIP: projects, submissions (with consent), contacts and meeting
 * requests as CSV, and every teaser file version that passed (or is waiting for) the virus check. Null when no
 * country has this ISO code.
 */
export async function exportCountryZip(
  viewer: Viewer,
  iso3: string,
  {
    meta,
    store = getBlobStore(),
    now = new Date(),
  }: Options & {
    store?: BlobStore;
    now?: Date;
  } = {},
): Promise<CountryExport | null> {
  guard(viewer, "country");
  const country = await db.country.findUnique({
    where: { iso3: iso3.toUpperCase() },
    select: { id: true, name: true, iso3: true, status: true },
  });
  if (!country) return null;

  const documents = await db.document.findMany({
    where: {
      kind: DocumentKind.TEASER,
      project: { AND: [adminProjectWhere(viewer), { countryId: country.id }] },
    },
    orderBy: [{ project: { title: "asc" } }, { version: "asc" }],
    select: {
      id: true,
      filename: true,
      version: true,
      blobKey: true,
      sizeBytes: true,
      scanStatus: true,
      uploadedAt: true,
      project: { select: { title: true } },
    },
  });
  // Never hand on a file that failed or did not finish its virus check.
  const included = documents.filter(
    (d) =>
      d.scanStatus === ScanStatus.CLEAN || d.scanStatus === ScanStatus.PENDING,
  );
  const excluded = documents.filter((d) => !included.includes(d));
  const totalBytes = included.reduce((sum, d) => sum + d.sizeBytes, 0);
  if (totalBytes > COUNTRY_EXPORT_MAX_BYTES) throw new AdminError("too_large");

  const [projects, submissions, contacts, requests] = await Promise.all([
    projectRows({
      AND: [adminProjectWhere(viewer), { countryId: country.id }],
    }),
    submissionRows({ countryId: country.id }),
    contactRows({ AND: [contactWhere(viewer), { countryId: country.id }] }),
    exportRequestsCsv(viewer, { countryId: country.id }, { meta }),
  ]);

  const entries: ZipEntry[] = [];
  const missing: string[] = [];
  for (const d of included) {
    const file = await store.get(d.blobKey);
    if (!file) {
      missing.push(`${d.project.title} v${d.version} ${d.filename}`);
      continue;
    }
    entries.push({
      name: teaserPath(d.project.title, d.version, d.filename),
      data: await readAll(file.stream),
      modifiedAt: d.uploadedAt,
    });
  }

  const enc = new TextEncoder();
  const readme = [
    `${appConfig.name}: export for ${country.name} (${country.iso3})`,
    `Made on ${now.toISOString()} (UTC).`,
    "",
    "projects.csv          the country's projects and their filters",
    "submissions.csv       every teaser submission with the consent given (wording version and time)",
    "contacts.csv          focal points and coordinators",
    "meeting-requests.csv  bilateral meeting requests and decisions",
    "teasers/              every teaser version, by project",
    "",
    `Teaser files included: ${entries.length}.`,
    ...(excluded.length > 0
      ? [
          `Left out because the virus check failed or found a problem: ${excluded.length}.`,
          ...excluded.map(
            (d) =>
              `  ${d.project.title} v${d.version} ${d.filename} (${d.scanStatus})`,
          ),
        ]
      : []),
    ...(missing.length > 0
      ? [
          `Missing from storage: ${missing.length}.`,
          ...missing.map((m) => `  ${m}`),
        ]
      : []),
    "",
    "Project data belongs to the country. Handle it according to the agreement with the country.",
    "",
  ].join("\r\n");

  const zip = createZip([
    { name: "README.txt", data: enc.encode(readme), modifiedAt: now },
    {
      name: "projects.csv",
      data: enc.encode(toCsv(PROJECT_EXPORT_HEADER, projects)),
      modifiedAt: now,
    },
    {
      name: "submissions.csv",
      data: enc.encode(toCsv(SUBMISSION_EXPORT_HEADER, submissions)),
      modifiedAt: now,
    },
    {
      name: "contacts.csv",
      data: enc.encode(toCsv(CONTACT_EXPORT_HEADER, contacts)),
      modifiedAt: now,
    },
    {
      name: "meeting-requests.csv",
      data: enc.encode(requests.csv),
      modifiedAt: now,
    },
    ...entries,
  ]);

  await audit(
    viewer,
    "country",
    meta,
    {
      iso3: country.iso3,
      projects: projects.length,
      submissions: submissions.length,
      contacts: contacts.length,
      meetingRequests: requests.count,
      files: entries.length,
      filesExcluded: excluded.length,
      filesMissing: missing.length,
      bytes: zip.byteLength,
    },
    country.id,
  );
  const day = now.toISOString().slice(0, 10);
  return {
    filename: `${country.iso3.toLowerCase()}-export-${day}.zip`,
    zip,
    files: entries.length,
  };
}

import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import {
  CountryStatus,
  DocumentKind,
  ProjectStatus,
  UserRole,
  UserStatus,
} from "@/generated/prisma/enums";
import { type RequestMeta, writeAudit } from "@/lib/audit";
import { type Viewer, workspacePermissions } from "@/lib/authz";
import {
  adminProjectWhere,
  canImportProjectMetadata,
  canUseAdminConsole,
} from "@/lib/authz/admin";
import { db } from "@/lib/db";
import { isPdfFilename } from "@/lib/workspace/teaser-file";
import {
  publishProject,
  WorkspaceError,
  type WorkspaceErrorCode,
  withdrawProject,
} from "@/lib/workspace/service";
import { parseCsv } from "./csv-parse";
import { ADMIN_AUDIT, AdminError } from "./errors";
import {
  type ImportPlan,
  METADATA_IMPORT_MAX_ROWS,
  planMetadataImport,
  type ProjectSnapshot,
} from "./metadata-import";

// Admin console, projects (M7, PLAN v0.3 F7): the overview of every project, publishing in bulk and the CSV import
// of PPP model, size and development stage. Editing a single project stays on the workspace project page
// (user decision, 18 Nov), and publishing goes through the workspace service, so the same blockers and audit apply.

export interface AdminProjectFilter {
  countryId?: string;
  status?: ProjectStatus;
  /** Only projects without a PPP model, a size or a development stage. */
  missing?: boolean;
}

/** Projects with at least one of the three filters still empty. */
export const MISSING_METADATA_WHERE: Prisma.ProjectWhereInput = {
  OR: [
    { pppModel: null },
    { AND: [{ sizeMinUsd: null }, { sizeMaxUsd: null }] },
    { developmentStage: null },
  ],
};

export function hasMissingMetadata(p: {
  pppModel: string | null;
  sizeMinUsd: unknown;
  sizeMaxUsd: unknown;
  developmentStage: string | null;
}): boolean {
  return (
    p.pppModel === null ||
    (p.sizeMinUsd === null && p.sizeMaxUsd === null) ||
    p.developmentStage === null
  );
}

export async function listAdminProjects(
  viewer: Viewer,
  filter: AdminProjectFilter = {},
) {
  if (!canUseAdminConsole(viewer)) throw new AdminError("forbidden");
  const projects = await db.project.findMany({
    where: {
      AND: [
        adminProjectWhere(viewer),
        filter.countryId ? { countryId: filter.countryId } : {},
        filter.status ? { status: filter.status } : {},
        filter.missing ? MISSING_METADATA_WHERE : {},
      ],
    },
    orderBy: [{ country: { name: "asc" } }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      sector: true,
      pppModel: true,
      sizeMinUsd: true,
      sizeMaxUsd: true,
      developmentStage: true,
      status: true,
      publishedAt: true,
      countryId: true,
      country: { select: { name: true, iso3: true, status: true } },
      documents: {
        where: { kind: DocumentKind.TEASER, supersededById: null },
        orderBy: { version: "desc" },
        take: 1,
        select: { version: true, scanStatus: true, filename: true },
      },
    },
  });
  return projects.map(({ documents, ...p }) => ({
    ...p,
    sizeMinUsd: p.sizeMinUsd?.toString() ?? null,
    sizeMaxUsd: p.sizeMaxUsd?.toString() ?? null,
    teaser: documents[0] ?? null,
    /** M11: the current teaser is another format; an admin attaches the converted PDF before publishing. */
    needsPdf: documents[0] ? !isPdfFilename(documents[0].filename) : false,
    missing: hasMissingMetadata(p),
    can: workspacePermissions(viewer, p),
  }));
}

export type AdminProject = Awaited<
  ReturnType<typeof listAdminProjects>
>[number];

/** Counts for the /admin hub. */
export async function getAdminOverview(viewer: Viewer) {
  if (!canUseAdminConsole(viewer)) throw new AdminError("forbidden");
  const where = adminProjectWhere(viewer);
  const [
    byStatus,
    missing,
    countries,
    countriesWithoutFocal,
    contacts,
    accounts,
    awaitingFirstSignIn,
    deactivated,
  ] = await Promise.all([
    db.project.groupBy({ by: ["status"], where, _count: { _all: true } }),
    db.project.count({
      where: {
        AND: [
          where,
          { status: { not: ProjectStatus.WITHDRAWN } },
          MISSING_METADATA_WHERE,
        ],
      },
    }),
    db.country.groupBy({ by: ["status"], _count: { _all: true } }),
    db.country.count({
      where: {
        status: CountryStatus.ACTIVE,
        contacts: { none: { role: "FOCAL_POINT" } },
      },
    }),
    db.countryContact.count(),
    db.user.count(),
    db.user.count({
      where: { mustChangePassword: true, status: UserStatus.ACTIVE },
    }),
    db.user.count({ where: { status: UserStatus.DEACTIVATED } }),
  ]);
  const projects = Object.fromEntries(
    Object.values(ProjectStatus).map((s) => [
      s,
      byStatus.find((b) => b.status === s)?._count._all ?? 0,
    ]),
  ) as Record<ProjectStatus, number>;
  const countryCount = (s: CountryStatus) =>
    countries.find((c) => c.status === s)?._count._all ?? 0;
  return {
    projects,
    missing,
    countries: {
      active: countryCount(CountryStatus.ACTIVE),
      inactive: countryCount(CountryStatus.INACTIVE),
      withoutFocalPoint: countriesWithoutFocal,
    },
    contacts,
    accounts: { total: accounts, awaitingFirstSignIn, deactivated },
    showAuditExport: viewer.role === UserRole.PLATFORM_ADMIN,
  };
}

// ---------------------------------------------------------------------------
// Publishing in bulk
// ---------------------------------------------------------------------------

export const BULK_PUBLISH_MAX = 200;

export interface BulkResult {
  projectId: string;
  ok: boolean;
  error?: WorkspaceErrorCode;
}

/** Publishes each project through the workspace service; one refusal does not stop the others. */
export async function publishProjects(
  viewer: Viewer,
  projectIds: readonly string[],
  { meta }: { meta?: RequestMeta } = {},
): Promise<BulkResult[]> {
  if (!canUseAdminConsole(viewer)) throw new AdminError("forbidden");
  const ids = [...new Set(projectIds)].slice(0, BULK_PUBLISH_MAX);
  const results: BulkResult[] = [];
  for (const projectId of ids) {
    try {
      await publishProject(viewer, projectId, { meta });
      results.push({ projectId, ok: true });
    } catch (error) {
      if (!(error instanceof WorkspaceError)) throw error;
      results.push({ projectId, ok: false, error: error.code });
    }
  }
  return results;
}

/** Takes one project out of the pipeline (status WITHDRAWN), through the workspace service. */
export async function unpublishProject(
  viewer: Viewer,
  projectId: string,
  { meta }: { meta?: RequestMeta } = {},
): Promise<void> {
  if (!canUseAdminConsole(viewer)) throw new AdminError("forbidden");
  await withdrawProject(viewer, projectId, { meta });
}

// ---------------------------------------------------------------------------
// CSV import of PPP model, size and development stage
// ---------------------------------------------------------------------------

export interface MetadataPreview {
  plan: ImportPlan;
  /** Ties the apply step to exactly this preview. */
  digest: string;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function planDigest(text: string, plan: ImportPlan): string {
  const changes = plan.rows
    .filter((r) => r.status === "change")
    .map((r) => [r.projectId, r.expectedUpdatedAt, r.data]);
  return sha256(
    `${sha256(text)}|${JSON.stringify([plan.fileErrors, changes])}`,
  );
}

async function projectSnapshots(viewer: Viewer): Promise<ProjectSnapshot[]> {
  const projects = await db.project.findMany({
    where: adminProjectWhere(viewer),
    select: {
      id: true,
      title: true,
      region: true,
      pppModel: true,
      sizeMinUsd: true,
      sizeMaxUsd: true,
      developmentStage: true,
      updatedAt: true,
      country: { select: { iso3: true, name: true } },
    },
  });
  return projects.map((p) => ({
    id: p.id,
    iso3: p.country.iso3,
    countryName: p.country.name,
    title: p.title,
    region: p.region,
    pppModel: p.pppModel,
    sizeMinUsd: p.sizeMinUsd?.toString() ?? null,
    sizeMaxUsd: p.sizeMaxUsd?.toString() ?? null,
    developmentStage: p.developmentStage,
    updatedAt: p.updatedAt.toISOString(),
  }));
}

async function planFor(viewer: Viewer, text: string): Promise<MetadataPreview> {
  const parsed = parseCsv(text, { maxRows: METADATA_IMPORT_MAX_ROWS });
  const plan: ImportPlan = parsed.ok
    ? planMetadataImport(parsed.table, await projectSnapshots(viewer))
    : {
        fileErrors: [parsed.error],
        ignoredColumns: [],
        rows: [],
        summary: { rows: 0, changes: 0, unchanged: 0, errors: 0 },
      };
  return { plan, digest: planDigest(text, plan) };
}

/** Step 2: what the file would change. Writes nothing (reading the projects needs no audit beyond the import). */
export async function previewMetadataImport(
  viewer: Viewer,
  text: string,
): Promise<MetadataPreview> {
  if (!canImportProjectMetadata(viewer)) throw new AdminError("forbidden");
  return planFor(viewer, text);
}

export interface ImportResult {
  importId: string;
  changed: number;
  unchanged: number;
  errors: number;
}

/**
 * Step 3: applies the rows with changes, all or nothing. The file is planned again against fresh data and must give
 * the same plan as the preview the admin saw (digest), and each project must still be unchanged since then.
 */
export async function applyMetadataImport(
  viewer: Viewer,
  text: string,
  digest: string,
  { meta }: { meta?: RequestMeta } = {},
): Promise<ImportResult> {
  if (!canImportProjectMetadata(viewer)) throw new AdminError("forbidden");
  const { plan, digest: fresh } = await planFor(viewer, text);
  if (plan.fileErrors.length > 0) throw new AdminError("invalid");
  if (fresh !== digest) throw new AdminError("stale");
  const importId = randomUUID();
  const changes = plan.rows.filter((r) => r.status === "change");
  await db.$transaction(async (tx) => {
    for (const row of changes) {
      if (!row.projectId || !row.expectedUpdatedAt) {
        throw new AdminError("conflict");
      }
      const updated = await tx.project.updateMany({
        where: {
          AND: [
            adminProjectWhere(viewer),
            {
              id: row.projectId,
              updatedAt: new Date(row.expectedUpdatedAt),
            },
          ],
        },
        data: row.data,
      });
      if (updated.count !== 1) throw new AdminError("conflict");
      await writeAudit(
        {
          actorId: viewer.id,
          action: ADMIN_AUDIT.PROJECT_UPDATE,
          entityType: "Project",
          entityId: row.projectId,
          meta,
          metadata: {
            changed: Object.keys(row.data),
            source: "csv_import",
            importId,
            line: row.line,
          },
        },
        tx,
      );
    }
    await writeAudit(
      {
        actorId: viewer.id,
        action: ADMIN_AUDIT.METADATA_IMPORT,
        entityType: "Project",
        entityId: null,
        meta,
        metadata: {
          importId,
          fileSha256: sha256(text),
          rows: plan.summary.rows,
          changed: plan.summary.changes,
          unchanged: plan.summary.unchanged,
          errors: plan.summary.errors,
        },
      },
      tx,
    );
  });
  return {
    importId,
    changed: changes.length,
    unchanged: plan.summary.unchanged,
    errors: plan.summary.errors,
  };
}

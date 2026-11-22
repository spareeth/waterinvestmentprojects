import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import {
  CountryStatus,
  DocumentKind,
  ProjectStatus,
  type ProjectType,
} from "@/generated/prisma/enums";
import type { RequestMeta } from "@/lib/audit";
import {
  AUTHZ_AUDIT,
  auditAccess,
  canDownloadDocument,
  canOpenDocumentFile,
  documentWhere,
  findProjectFor,
  PROJECT_POLICY_SELECT,
  projectWhere,
  type Viewer,
} from "@/lib/authz";
import { db } from "@/lib/db";
import { type TeaserFileType, teaserTypeOf } from "@/lib/workspace/teaser-file";
import { type PipelineFilters, pipelineFilterWhere } from "./filters";

// The pipeline (PLAN v0.3 F3, F4): published teasers, as the policy module lets this viewer see them.
// Visibility comes only from src/lib/authz (projectWhere, documentWhere, findProjectFor, canDownloadDocument).
// This module adds narrowing conditions on top (published, active country, the user's filters) and never widens.

interface Options {
  client?: Prisma.TransactionClient;
}

/**
 * What the pipeline shows: PUBLISHED projects of ACTIVE countries. The same for every role, so admins and country
 * users see what investors see; drafts stay in the country workspace.
 */
export const PIPELINE_BASE_WHERE: Prisma.ProjectWhereInput = {
  status: ProjectStatus.PUBLISHED,
  country: { status: CountryStatus.ACTIVE },
};

/** The policy module's visibility AND the pipeline base, optionally AND the user's filters. */
export function pipelineWhere(
  viewer: Viewer | null,
  filters: PipelineFilters = {},
): Prisma.ProjectWhereInput {
  return {
    AND: [
      projectWhere(viewer),
      PIPELINE_BASE_WHERE,
      pipelineFilterWhere(filters),
    ],
  };
}

const CARD_SELECT = {
  id: true,
  title: true,
  sector: true,
  region: true,
  pppModel: true,
  sizeMinUsd: true,
  sizeMaxUsd: true,
  developmentStage: true,
  projectType: true,
  publishedAt: true,
  country: { select: { name: true, iso3: true } },
} as const satisfies Prisma.ProjectSelect;

function toNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

export interface PipelineCard {
  id: string;
  title: string;
  sector: string;
  region: string | null;
  pppModel: string | null;
  sizeMinUsd: number | null;
  sizeMaxUsd: number | null;
  developmentStage: string | null;
  projectType: ProjectType;
  publishedAt: Date | null;
  country: { name: string; iso3: string };
}

/** Published projects the viewer may see, matching the filters, newest first. */
export async function listPipelineProjects(
  viewer: Viewer | null,
  filters: PipelineFilters,
  { client = db }: Options = {},
): Promise<PipelineCard[]> {
  if (!viewer) return [];
  const projects = await client.project.findMany({
    where: pipelineWhere(viewer, filters),
    select: CARD_SELECT,
    orderBy: [
      { publishedAt: { sort: "desc", nulls: "last" } },
      { title: "asc" },
    ],
  });
  return projects.map((p) => ({
    ...p,
    sizeMinUsd: toNumber(p.sizeMinUsd),
    sizeMaxUsd: toNumber(p.sizeMaxUsd),
  }));
}

export interface PipelineFacets {
  /** Unfiltered totals of the viewer's pipeline. */
  total: number;
  countryCount: number;
  countries: { iso3: string; name: string }[];
  sectors: string[];
  pppModels: string[];
  stages: string[];
}

const collator = new Intl.Collator("en-GB", { sensitivity: "base" });

function uniqueSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort(
    collator.compare,
  );
}

/**
 * The filter options: values found in the viewer's own visible pipeline only, so an option can never reveal a
 * draft or a country the viewer cannot see.
 */
export async function pipelineFacets(
  viewer: Viewer | null,
  { client = db }: Options = {},
): Promise<PipelineFacets> {
  if (!viewer) {
    return {
      total: 0,
      countryCount: 0,
      countries: [],
      sectors: [],
      pppModels: [],
      stages: [],
    };
  }
  const rows = await client.project.findMany({
    where: pipelineWhere(viewer),
    select: {
      sector: true,
      pppModel: true,
      developmentStage: true,
      country: { select: { iso3: true, name: true } },
    },
  });
  const countries = new Map<string, string>();
  for (const r of rows) countries.set(r.country.iso3, r.country.name);
  return {
    total: rows.length,
    countryCount: countries.size,
    countries: [...countries]
      .map(([iso3, name]) => ({ iso3, name }))
      .sort((a, b) => collator.compare(a.name, b.name)),
    sectors: uniqueSorted(rows.map((r) => r.sector)),
    pppModels: uniqueSorted(rows.map((r) => r.pppModel)),
    stages: uniqueSorted(rows.map((r) => r.developmentStage)),
  };
}

export interface PipelineTeaser {
  id: string;
  filename: string;
  version: number;
  sizeBytes: number;
  uploadedAt: Date;
  /** "pdf" can be shown in the page; any other format can only be downloaded (pipeline viewers only get PDFs). */
  fileType: TeaserFileType;
  /** The policy module lets this viewer open the file now (scanned CLEAN and visible). */
  canOpen: boolean;
  canDownload: boolean;
}

export interface PipelineProjectDetail {
  project: PipelineCard & { countryId: string };
  teaser: PipelineTeaser | null;
}

/**
 * One published project of the viewer's pipeline with its current teaser (metadata only, never the blob key),
 * or null when the viewer may not see it or it is not in the pipeline (drafts, withdrawn, inactive country).
 * Writes a project.view audit event for a project that is shown.
 */
export async function getPipelineProject(
  viewer: Viewer | null,
  projectId: string,
  { client = db, meta }: Options & { meta?: RequestMeta } = {},
): Promise<PipelineProjectDetail | null> {
  if (!viewer) return null;
  const visible = await findProjectFor(viewer, projectId, { client });
  if (!visible) return null;
  // Narrow to the pipeline: the same project may be visible to its own country or an admin as a draft.
  const project = await client.project.findFirst({
    where: { AND: [{ id: visible.id }, pipelineWhere(viewer)] },
    select: { ...CARD_SELECT, countryId: true },
  });
  if (!project) return null;

  const doc = await client.document.findFirst({
    where: {
      AND: [
        documentWhere(viewer),
        {
          projectId: project.id,
          kind: DocumentKind.TEASER,
          supersededById: null,
        },
      ],
    },
    orderBy: { version: "desc" },
    omit: { blobKey: true },
    include: { project: { select: PROJECT_POLICY_SELECT } },
  });

  await auditAccess(
    viewer,
    {
      action: AUTHZ_AUDIT.PROJECT_VIEW,
      entityType: "Project",
      entityId: project.id,
      meta,
      metadata: { source: "pipeline", teaserId: doc?.id ?? null },
    },
    client,
  );

  return {
    project: {
      ...project,
      sizeMinUsd: toNumber(project.sizeMinUsd),
      sizeMaxUsd: toNumber(project.sizeMaxUsd),
    },
    teaser: doc
      ? {
          id: doc.id,
          filename: doc.filename,
          version: doc.version,
          sizeBytes: doc.sizeBytes,
          uploadedAt: doc.uploadedAt,
          fileType: teaserTypeOf(doc.filename),
          canOpen: canOpenDocumentFile(viewer, doc),
          canDownload: canDownloadDocument(viewer, doc),
        }
      : null,
  };
}

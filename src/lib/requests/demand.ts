// Demand for a country's projects (M13, PLAN v0.4 0b.16): how many meeting requests each project received, by the
// requester's organisation type, whatever the country decided (declined requests count too; withdrawn ones do
// not). Pure, so the summary can be unit tested; the rows come from the request inbox policy.

import type { OrganisationType } from "@/generated/prisma/enums";
import { ORGANISATION_TYPE_LABEL } from "@/lib/auth/pre-approval";

export type DemandKey = OrganisationType | "NOT_STATED";

export interface ProjectDemand {
  total: number;
  byType: { key: DemandKey; label: string; count: number }[];
}

const ORDER: DemandKey[] = [
  ...(Object.keys(ORGANISATION_TYPE_LABEL) as OrganisationType[]),
  "NOT_STATED",
];

function labelOf(key: DemandKey): string {
  return key === "NOT_STATED" ? "Not stated" : ORGANISATION_TYPE_LABEL[key];
}

/** Groups request rows by project, then by organisation type in the form's order. */
export function summariseDemand(
  rows: { projectId: string; organisationType: OrganisationType | null }[],
): Map<string, ProjectDemand> {
  const counts = new Map<string, Map<DemandKey, number>>();
  for (const row of rows) {
    const key: DemandKey = row.organisationType ?? "NOT_STATED";
    const project = counts.get(row.projectId) ?? new Map<DemandKey, number>();
    project.set(key, (project.get(key) ?? 0) + 1);
    counts.set(row.projectId, project);
  }
  const result = new Map<string, ProjectDemand>();
  for (const [projectId, byKey] of counts) {
    const byType = ORDER.filter((k) => byKey.has(k)).map((k) => ({
      key: k,
      label: labelOf(k),
      count: byKey.get(k) ?? 0,
    }));
    result.set(projectId, {
      total: byType.reduce((sum, t) => sum + t.count, 0),
      byType,
    });
  }
  return result;
}

/** "3 meeting requests: Investor or fund 2, DFI or MDB 1". */
export function describeDemand(demand: ProjectDemand | undefined): string {
  if (!demand || demand.total === 0) return "No meeting requests yet";
  const head = `${demand.total} meeting ${demand.total === 1 ? "request" : "requests"}`;
  return `${head}: ${demand.byType.map((t) => `${t.label} ${t.count}`).join(", ")}`;
}

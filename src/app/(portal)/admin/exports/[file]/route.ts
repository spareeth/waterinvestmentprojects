import { requestMetaFrom } from "@/lib/audit";
import { getViewer } from "@/lib/authz";
import { AdminError } from "@/lib/admin/errors";
import {
  type CsvExport,
  exportAccountsCsv,
  exportAuditCsv,
  exportContactsCsv,
  exportProjectsCsv,
  exportSubmissionsCsv,
} from "@/lib/admin/exports";

// Admin CSV exports (M7, PLAN v0.3 F7). The service checks canExportKind in src/lib/authz/admin.ts and writes
// the export audit event. Anyone else, and any unknown file name, gets 404, so the route does not leak. Reading
// the session makes it run per request (route segment config is not allowed with cacheComponents).

type Exporter = typeof exportProjectsCsv;

const EXPORTS: Record<string, Exporter> = {
  "projects.csv": exportProjectsCsv,
  "submissions.csv": exportSubmissionsCsv,
  "accounts.csv": exportAccountsCsv,
  "contacts.csv": exportContactsCsv,
  "audit.csv": exportAuditCsv,
};

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await params;
  const exporter = Object.hasOwn(EXPORTS, file) ? EXPORTS[file] : undefined;
  const viewer = await getViewer();
  if (!viewer || !exporter) return notFound();
  let result: CsvExport;
  try {
    result = await exporter(viewer, {
      meta: requestMetaFrom(request.headers),
    });
  } catch (error) {
    if (error instanceof AdminError) return notFound();
    throw error;
  }
  const day = new Date().toISOString().slice(0, 10);
  const name = file.replace(/\.csv$/, "");
  return new Response(result.csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}-${day}.csv"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

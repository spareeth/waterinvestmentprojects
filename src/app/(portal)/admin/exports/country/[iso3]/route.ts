import { requestMetaFrom } from "@/lib/audit";
import { getViewer } from "@/lib/authz";
import { AdminError } from "@/lib/admin/errors";
import { exportCountryZip } from "@/lib/admin/exports";

// Per-country export (M7, PLAN v0.3 0.14): one ZIP with the country's projects, submissions, contacts, meeting
// requests and teaser files. Admins only (canExportKind in src/lib/authz/admin.ts); everyone else gets 404.
// Reading the session makes it run per request (route segment config is not allowed with cacheComponents).

function plain(status: number, text: string) {
  return new Response(text, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ iso3: string }> },
): Promise<Response> {
  const { iso3 } = await params;
  const viewer = await getViewer();
  if (!viewer || !/^[A-Za-z]{3}$/.test(iso3)) return plain(404, "Not found");
  try {
    const result = await exportCountryZip(viewer, iso3, {
      meta: requestMetaFrom(request.headers),
    });
    if (!result) return plain(404, "Not found");
    return new Response(Buffer.from(result.zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${result.filename}"`,
        "content-length": String(result.zip.byteLength),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AdminError) {
      return error.code === "too_large"
        ? plain(413, "The export is too large to build in one go.")
        : plain(404, "Not found");
    }
    throw error;
  }
}

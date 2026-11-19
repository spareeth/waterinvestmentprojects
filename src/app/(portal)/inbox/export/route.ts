import { MeetingRequestStatus } from "@/generated/prisma/enums";
import { requestMetaFrom } from "@/lib/audit";
import { getViewer } from "@/lib/authz";
import { RequestError } from "@/lib/requests/errors";
import { exportRequestsCsv } from "@/lib/requests/service";

// CSV download of meeting requests (M5, PLAN v0.3 F7): the same rows the viewer sees in /inbox, optionally for one
// country or status. The policy module decides (admins all countries; focal points and WBG coordinators their own);
// the service writes a meeting_request.export audit event. Anyone else gets 404, so the route does not leak.

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(request: Request): Promise<Response> {
  const viewer = await getViewer();
  if (!viewer) return notFound();
  const params = new URL(request.url).searchParams;
  const status = params.get("status") ?? "";
  const country = params.get("country") ?? "";
  try {
    const { csv } = await exportRequestsCsv(
      viewer,
      {
        status: Object.values(MeetingRequestStatus).includes(
          status as MeetingRequestStatus,
        )
          ? (status as MeetingRequestStatus)
          : undefined,
        // Only narrows the viewer's own rows; an id outside them simply matches nothing.
        countryId: /^[\w-]{1,64}$/.test(country) ? country : undefined,
      },
      { meta: requestMetaFrom(request.headers) },
    );
    const day = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="meeting-requests-${day}.csv"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof RequestError) return notFound();
    throw error;
  }
}

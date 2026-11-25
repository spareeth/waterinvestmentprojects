import { requestMetaFrom } from "@/lib/audit";
import { getViewer } from "@/lib/authz";
import { exportSignupsCsv, SignupError } from "@/lib/meetings/signups";

// CSV download of meeting sign-ups (25 Nov): the rows the viewer sees in /inbox, optionally for one country. The
// policy module decides (admins all countries; country users and WBG coordinators their own); the service writes a
// meeting_signup.export audit event. Anyone else gets 404, so the route does not leak.

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(request: Request): Promise<Response> {
  const viewer = await getViewer();
  if (!viewer) return notFound();
  const country = new URL(request.url).searchParams.get("country") ?? "";
  try {
    const { csv } = await exportSignupsCsv(viewer, {
      // Only narrows the viewer's own rows; an id outside them simply matches nothing.
      countryId: /^[\w-]{1,64}$/.test(country) ? country : undefined,
      meta: requestMetaFrom(request.headers),
    });
    const day = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="meeting-signups-${day}.csv"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof SignupError) return notFound();
    throw error;
  }
}

import { headers } from "next/headers";
import { requestMetaFrom } from "@/lib/audit";
import { AuthzError, authorizeDocumentFile, getViewer } from "@/lib/authz";
import { getBlobStore } from "@/lib/storage";
import { privateFileHeaders } from "@/lib/storage/http";

// Files are never public (CLAUDE.md). The only way to a stored file: the policy module decides (and audits
// document.view, document.download or access.denied), then the file is streamed with private, no-store headers.
// /files/<id> opens the PDF in the browser; /files/<id>?download=1 saves it, where downloading is allowed.

export async function GET(
  request: Request,
  { params }: RouteContext<"/files/[documentId]">,
) {
  const { documentId } = await params;
  const mode =
    new URL(request.url).searchParams.get("download") === "1"
      ? "download"
      : "view";
  const h = await headers();
  const viewer = await getViewer();
  if (!viewer) return new Response("Not found", { status: 404 });

  let file;
  try {
    file = await authorizeDocumentFile(viewer, documentId, mode, {
      meta: requestMetaFrom(h),
    });
  } catch (error) {
    if (error instanceof AuthzError) {
      return new Response(
        error.code === "forbidden" ? "Not allowed" : "Not found",
        { status: error.code === "forbidden" ? 403 : 404 },
      );
    }
    throw error;
  }

  const stored = await getBlobStore().get(file.blobKey);
  if (!stored) return new Response("Not found", { status: 404 });
  return new Response(stored.stream, {
    headers: privateFileHeaders(mode, file.filename, stored.sizeBytes),
  });
}

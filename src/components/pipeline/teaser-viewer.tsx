import { Download, ExternalLink, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { PipelineTeaser } from "@/lib/pipeline/service";

// The teaser viewer (PLAN v0.3 F4; user decision 18 Nov: the browser's own PDF viewer for the demo, pdf.js later
// if needed). The file only ever comes from /files/<id>, which asks the policy module (authorizeDocumentFile) and
// audits every view and download; the page never sees a blob key or a public URL.
// No sandbox attribute on the frame: browsers refuse to run their PDF viewer inside a sandboxed frame. The file
// is served same-origin as application/pdf with nosniff, so it cannot run as a page.

export function teaserFileHref(teaserId: string, mode: "view" | "download") {
  const base = `/files/${encodeURIComponent(teaserId)}`;
  return mode === "download" ? `${base}?download=1` : base;
}

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/40 p-8 text-center">
      <FileText aria-hidden="true" className="size-8 text-muted-foreground" />
      <div className="max-w-sm text-muted-foreground">{children}</div>
    </div>
  );
}

export function TeaserViewer({
  teaser,
  title,
}: {
  teaser: PipelineTeaser | null;
  title: string;
}) {
  if (!teaser) {
    return (
      <Placeholder>
        The teaser for this project is not available yet.
      </Placeholder>
    );
  }
  if (!teaser.canOpen) {
    return (
      <Placeholder>
        The latest teaser is being checked and will be available shortly.
      </Placeholder>
    );
  }
  if (teaser.fileType !== "pdf") {
    return (
      <Placeholder>
        <p>This teaser is not a PDF, so it cannot be shown in the page.</p>
        {teaser.canDownload ? (
          <Button asChild className="mt-4">
            <a href={teaserFileHref(teaser.id, "download")} download>
              <Download aria-hidden="true" />
              Download the teaser
            </a>
          </Button>
        ) : null}
      </Placeholder>
    );
  }
  const viewHref = teaserFileHref(teaser.id, "view");
  return (
    <>
      <iframe
        src={`${viewHref}#view=FitH&navpanes=0`}
        title={`Teaser: ${title}`}
        className="hidden h-[80vh] min-h-[36rem] w-full rounded-md border border-water-100 bg-muted md:block"
      />
      <div className="md:hidden">
        <Placeholder>
          <p>Open the teaser to read it on this device.</p>
          <Button asChild className="mt-4">
            <a href={viewHref} target="_blank" rel="noopener">
              <ExternalLink aria-hidden="true" />
              Open the teaser
            </a>
          </Button>
        </Placeholder>
      </div>
      <p className="mt-3 hidden text-sm md:block">
        <a
          href={viewHref}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 link"
        >
          <ExternalLink aria-hidden="true" className="size-4" />
          Open in a new tab
        </a>
      </p>
    </>
  );
}

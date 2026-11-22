import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { SubmissionForm } from "@/components/submission/submission-form";
import { requestMetaFrom } from "@/lib/audit";
import { takeToken } from "@/lib/auth/rate-limit";
import type { UploadLinkState } from "@/lib/authz";
import { appConfig } from "@/lib/config";
import { formatUaeTime } from "@/lib/submission/format";
import { SUBMISSION_MESSAGES } from "@/lib/submission/errors";
import { openUploadLink } from "@/lib/submission/service";

// Reads the database on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = {
  title: "Upload project teasers",
  // The token is in the URL: never send it to another site in a Referer header.
  referrer: "no-referrer",
};

const PROBLEMS: Record<
  Exclude<UploadLinkState, "valid"> | "rate_limited",
  { title: string; body: string }
> = {
  not_found: {
    title: "Upload link not valid",
    body: SUBMISSION_MESSAGES.link_invalid,
  },
  revoked: {
    title: "Upload link not valid",
    body: SUBMISSION_MESSAGES.link_invalid,
  },
  expired: {
    title: "Upload link expired",
    body: SUBMISSION_MESSAGES.link_expired,
  },
  rate_limited: {
    title: "Please wait a moment",
    body: SUBMISSION_MESSAGES.rate_limited,
  },
};

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <SiteHeader>
        {/* New tab, so a half-filled form is not lost; no-referrer keeps the upload token out of logs. */}
        <a
          href="/guide#governments"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/90 hover:text-white"
        >
          User guide
        </a>
      </SiteHeader>
      <main className="flex flex-1 flex-col items-center px-4 py-10 sm:py-14">
        <section
          aria-labelledby="page-title"
          className="w-full max-w-3xl rounded-xl border bg-card p-6 shadow-sm sm:p-8"
        >
          <h1
            id="page-title"
            className="text-2xl font-semibold tracking-tight text-brand-navy"
          >
            {title}
          </h1>
          <div className="mt-3">{children}</div>
        </section>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          {appConfig.tagline} · {appConfig.copyright}
          {appConfig.supportEmail ? ` · Help: ${appConfig.supportEmail}` : ""}
        </p>
      </main>
    </>
  );
}

/**
 * Government upload page (M0, PLAN v0.3 F0). No account: the token in the URL is the only authorisation and
 * fixes the country (except on the generic link). Rate limited per IP; every opening is audited.
 */
export default async function SubmitPage({
  params,
}: PageProps<"/submit/[token]">) {
  // Link state depends on the clock and the database: always render per request.
  await connection();
  const { token: raw } = await params;
  const token = decodeURIComponent(raw);
  const meta = requestMetaFrom(await headers());

  if (!takeToken("uploadLinkOpen", meta.ip)) {
    const p = PROBLEMS.rate_limited;
    return (
      <Shell title={p.title}>
        <p className="text-sm text-muted-foreground">{p.body}</p>
      </Shell>
    );
  }

  const page = await openUploadLink(token, { meta });
  if (page.state !== "valid") {
    const p = PROBLEMS[page.state];
    return (
      <Shell title={p.title}>
        <p className="text-sm text-muted-foreground">{p.body}</p>
      </Shell>
    );
  }

  return (
    <Shell title="Upload project teasers">
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>
          Use this page to send
          {page.country ? ` ${page.country.name}'s` : " your Government's"}{" "}
          one-page project teasers for the Water Investment Summit. The Summit
          team checks every teaser before it is shared with the invited
          participants.
        </p>
        {page.expiresAt ? (
          <p>This link works until {formatUaeTime(page.expiresAt)}.</p>
        ) : null}
      </div>
      <div className="mt-6">
        <SubmissionForm
          token={token}
          countryName={page.country?.name ?? null}
          countries={page.countries}
          acknowledgementText={appConfig.uploadAcknowledgement.text}
        />
      </div>
    </Shell>
  );
}

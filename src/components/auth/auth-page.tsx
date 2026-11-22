import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { appConfig } from "@/lib/config";

/** The gradient panel beside the sign-in and register forms (22 Nov styling pass). */
export interface AuthAside {
  headline: string;
  text: string;
  points: string[];
}

/**
 * Centred card used by the sign-in, invitation, two-step, terms and pending screens. With `aside`, the page is
 * split: a gradient panel with a headline on the left and the form on the right, stacked below 1024 px.
 */
export function AuthPage({
  title,
  description,
  children,
  header,
  wide = false,
  aside,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Navigation for the dark top bar; defaults to a link back to sign-in. */
  header?: ReactNode;
  wide?: boolean;
  aside?: AuthAside;
}) {
  const card = (
    <section
      aria-labelledby="page-title"
      className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-xl border bg-card p-6 shadow-sm sm:p-8`}
    >
      <h1
        id="page-title"
        className="text-2xl font-semibold tracking-tight text-brand-navy"
      >
        {title}
      </h1>
      {description ? (
        <div className="mt-2 text-sm text-muted-foreground">{description}</div>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
  const footnote = (
    <p className="mt-8 text-center text-xs text-muted-foreground">
      {appConfig.tagline} · {appConfig.copyright}
    </p>
  );
  return (
    <>
      <SiteHeader>
        {/* Every sign-in and account screen links to the user guide. */}
        <Link href="/guide" className="text-white/90 hover:text-white">
          User guide
        </Link>
        {header ?? (
          <Link href="/sign-in" className="text-white/90 hover:text-white">
            Sign in
          </Link>
        )}
      </SiteHeader>
      {aside ? (
        <main className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <aside className="relative overflow-hidden bg-linear-135 from-brand-navy via-brand-deep to-brand-teal px-6 py-10 text-white sm:px-10 lg:flex lg:flex-col lg:justify-center lg:px-14 lg:py-16">
            <div className="relative max-w-lg">
              <p className="text-xs font-semibold tracking-wide text-white/75 uppercase">
                {appConfig.summit.name} · {appConfig.summit.date}
              </p>
              <p className="mt-3 text-2xl leading-tight font-bold tracking-tight sm:text-3xl lg:text-4xl">
                {aside.headline}
              </p>
              <p className="mt-4 text-white/90">{aside.text}</p>
              <ul className="mt-6 hidden flex-col gap-3 sm:flex">
                {aside.points.map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                      <Check aria-hidden="true" className="size-3.5" />
                    </span>
                    <span className="text-sm text-white/90">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
          <div className="flex flex-col items-center px-4 py-10 sm:py-14 lg:justify-center">
            {card}
            {footnote}
          </div>
        </main>
      ) : (
        <main className="flex flex-1 flex-col items-center px-4 py-10 sm:py-16">
          {card}
          {footnote}
        </main>
      )}
    </>
  );
}

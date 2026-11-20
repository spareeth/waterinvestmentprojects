import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { appConfig } from "@/lib/config";

/** Centred card used by the sign-in, invitation, two-step, terms and pending screens. */
export function AuthPage({
  title,
  description,
  children,
  header,
  wide = false,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Navigation for the dark top bar; defaults to a link back to sign-in. */
  header?: ReactNode;
  wide?: boolean;
}) {
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
      <main className="flex flex-1 flex-col items-center px-4 py-10 sm:py-16">
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
            <div className="mt-2 text-sm text-muted-foreground">
              {description}
            </div>
          ) : null}
          <div className="mt-6">{children}</div>
        </section>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          {appConfig.tagline} · {appConfig.copyright}
        </p>
      </main>
    </>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand/brand-mark";
import { appConfig } from "@/lib/config";

/**
 * Dark top bar shared by the public site and the signed-in app. Navigation is passed in by each area. The
 * tagline only shows when there is room for it (wide screens, or no navigation), and the navigation wraps onto
 * a second line rather than squeezing the name, so admin links never crowd the bar.
 */
export function SiteHeader({
  children,
  homeHref = "/",
}: {
  children?: ReactNode;
  /** Where the name and mark lead: the public landing page, or the portal home for signed-in pages. */
  homeHref?: string;
}) {
  const taglineClass = children ? "hidden xl:block" : "hidden md:block";
  return (
    <header className="bg-brand-navy text-white">
      <div className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-9">
        <Link
          href={homeHref}
          className="flex shrink-0 items-center gap-3 rounded-lg focus-visible:ring-3 focus-visible:ring-brand-aqua/60 focus-visible:outline-none"
        >
          <BrandMark />
          <span className="text-lg font-semibold tracking-tight whitespace-nowrap">
            {appConfig.name}
          </span>
        </Link>
        <span
          aria-hidden="true"
          className={`h-5 w-px bg-white/30 ${taglineClass}`}
        />
        <span className={`text-sm text-white/80 ${taglineClass}`}>
          {appConfig.tagline}
        </span>
        {children ? (
          <nav
            aria-label="Main"
            className="ms-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm whitespace-nowrap sm:gap-x-6"
          >
            {children}
          </nav>
        ) : null}
      </div>
    </header>
  );
}

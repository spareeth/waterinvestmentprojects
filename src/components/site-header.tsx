import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand/brand-mark";
import { appConfig } from "@/lib/config";

/** Dark top bar shared by the public site and the signed-in app. Navigation is passed in by each area. */
export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="bg-brand-navy text-white">
      <div className="flex h-16 items-center gap-4 px-4 sm:px-9">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg focus-visible:ring-3 focus-visible:ring-brand-aqua/60 focus-visible:outline-none"
        >
          <BrandMark />
          <span className="text-lg font-semibold tracking-tight">
            {appConfig.name}
          </span>
        </Link>
        <span
          aria-hidden="true"
          className="hidden h-5 w-px bg-white/30 md:block"
        />
        <span className="hidden text-sm text-white/80 md:block">
          {appConfig.tagline}
        </span>
        {children ? (
          <nav
            aria-label="Main"
            className="ms-auto flex items-center gap-2 text-sm sm:gap-6"
          >
            {children}
          </nav>
        ) : null}
      </div>
    </header>
  );
}

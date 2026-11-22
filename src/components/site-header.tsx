import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand/brand-mark";
import { MobileNav } from "@/components/mobile-nav";
import { appConfig } from "@/lib/config";

/**
 * Dark top bar shared by the public site and the signed-in app. Navigation is passed in by each area.
 * On wide screens the name and the menu share one row (22 Nov styling pass); below that the menu moves into a
 * side sheet behind a menu button. The tagline only shows when there is room for it.
 */
/**
 * Width from which the links fit on one row next to the name. Public pages: 768 px. Signed-in menus are longer
 * (up to eight admin tabs plus the name badge), so they keep the menu button up to 1280 px (1400 px for admins).
 */
const MENU_FROM = {
  md: { nav: "md:flex", button: "md:hidden" },
  xl: { nav: "xl:flex", button: "xl:hidden" },
  wide: { nav: "min-[1400px]:flex", button: "min-[1400px]:hidden" },
} as const;

export function SiteHeader({
  children,
  homeHref = "/",
  menuFrom = "md",
}: {
  children?: ReactNode;
  /** Where the name and mark lead: the public landing page, or the portal home for signed-in pages. */
  homeHref?: string;
  menuFrom?: keyof typeof MENU_FROM;
}) {
  const menu = MENU_FROM[menuFrom];
  // The tagline needs room: public pages from 1280 px; signed-in menus are too long for it.
  const taglineClass = !children
    ? "hidden md:block"
    : menuFrom === "md"
      ? "hidden xl:block"
      : "hidden";
  return (
    <header className="bg-brand-navy text-white">
      <div className="flex min-h-16 flex-nowrap items-center gap-x-4 px-4 py-3 sm:px-9">
        <Link
          href={homeHref}
          className="flex min-w-0 shrink-0 items-center gap-3 rounded-lg focus-visible:ring-3 focus-visible:ring-brand-aqua/60 focus-visible:outline-none"
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
        <span
          className={`text-sm whitespace-nowrap text-white/80 ${taglineClass}`}
        >
          {appConfig.tagline}
        </span>
        {children ? (
          <>
            <nav
              aria-label="Main"
              className={`ms-auto hidden min-w-0 flex-nowrap items-center justify-end gap-x-5 text-sm whitespace-nowrap ${menu.nav}`}
            >
              {children}
            </nav>
            <MobileNav buttonClassName={menu.button}>{children}</MobileNav>
          </>
        ) : null}
      </div>
    </header>
  );
}

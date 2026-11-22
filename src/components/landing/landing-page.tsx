import {
  ArrowRight,
  CalendarCheck,
  FileUp,
  Mail,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PartnerLogos } from "@/components/brand/partner-logos";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { appConfig } from "@/lib/config";

// Public landing page (PLAN v0.3 F1, M6), following docs/mockups/01_landing.png. Name, Summit details, partners
// and the support mailbox all come from config. No project names or country details appear here: the pipeline is
// visible only after sign-in.

const accessSteps = [
  {
    icon: UserCheck,
    eyebrow: "01 · Approved access",
    title: "Personal accounts",
    body: "Governments and the Summit team receive their accounts from the Summit team. Investors and operators register, and the Summit team checks each registration before the projects become visible.",
  },
  {
    icon: FileUp,
    eyebrow: "02 · Governments",
    title: "Countries share their teasers",
    body: "Each participating government uploads its one-page project teasers through its own upload link from the Summit team, and confirms they can be shared. Project information remains the country's.",
  },
  {
    icon: CalendarCheck,
    eyebrow: "03 · Investors and operators",
    title: "From teaser to meeting",
    body: "Approved investors and operators view and download the published teasers and request bilateral meetings. The country's focal point accepts or declines each request.",
  },
] as const;

const navLinkClass = "text-white/90 hover:text-white";

/**
 * The landing page is part of the portal: for someone signed in, `portalHeader` is the same top bar as on every
 * other signed-in page (menu, their name, sign-out), and the main button leads to the projects.
 */
export function LandingPage({
  portalHeader = null,
  registrationOpen = false,
}: {
  portalHeader?: ReactNode;
  /** M13: SELF_REGISTRATION_ENABLED, read by the page at request time. */
  registrationOpen?: boolean;
} = {}) {
  const { summit, supportEmail } = appConfig;
  const signedIn = portalHeader !== null;
  const entry = signedIn
    ? { href: "/pipeline", label: "View projects" }
    : { href: "/sign-in", label: "Sign in" };
  return (
    <>
      {signedIn ? (
        portalHeader
      ) : (
        <SiteHeader>
          <a href="#about" className={navLinkClass}>
            About
          </a>
          <Link href="/guide" className="text-white/90 hover:text-white">
            User guide
          </Link>
          <Button
            asChild
            size="lg"
            className="bg-white text-brand-navy hover:bg-white/90"
          >
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </SiteHeader>
      )}

      <main className="flex flex-1 flex-col">
        <section
          id="about"
          aria-labelledby="about-heading"
          className="relative overflow-hidden bg-linear-120 from-brand-navy via-brand-deep to-brand-deep text-white lg:to-brand-teal"
        >
          <WaveLines className="pointer-events-none absolute top-1/2 right-[3%] hidden h-72 w-auto -translate-y-1/2 text-white/40 lg:block" />
          <div className="relative mx-auto flex max-w-page flex-col items-start gap-6 px-4 py-16 sm:px-8 sm:py-20">
            <p className="rounded-full border border-white/30 bg-white/10 px-3.5 py-1.5 text-xs sm:text-sm">
              {summit.name} · {summit.date} · {summit.conference}, {summit.city}
            </p>
            <h1
              id="about-heading"
              className="max-w-3xl text-3xl leading-tight font-bold tracking-tight sm:text-5xl"
            >
              A pipeline of water project opportunities from participating
              governments.
            </h1>
            <p className="max-w-2xl text-base text-white/90 sm:text-lg">
              Invited investors and operators can review the projects and
              request bilateral meetings with the governments behind them.
            </p>
            {!signedIn && registrationOpen ? (
              <p className="text-sm text-white/90 sm:text-base">
                Investor or operator?{" "}
                <Link
                  href="/register"
                  className="font-semibold text-white underline underline-offset-4 hover:text-white/80"
                >
                  Register here
                </Link>
                .
              </p>
            ) : null}
            {/* Buttons on the left, partner logos bottom right on the same row; on narrow screens the logos wrap
                below the buttons. */}
            <div className="flex w-full flex-wrap items-end justify-between gap-x-6 gap-y-8">
              <div className="flex flex-wrap gap-3">
                <Button
                  asChild
                  size="lg"
                  className="h-11 bg-white px-5 text-brand-navy hover:bg-white/90"
                >
                  <Link href={entry.href}>
                    {entry.label}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-11 border-white/40 bg-white/10 px-5 text-white hover:bg-white/20 hover:text-white"
                >
                  <a href="#how-access-works">How access works</a>
                </Button>
              </div>
              {appConfig.partners.some((p) => p.logo) ? (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium tracking-wide text-white/80 uppercase">
                    In partnership with
                  </span>
                  <PartnerLogos partners={appConfig.partners} />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section
          id="how-access-works"
          aria-labelledby="how-access-works-heading"
          className="scroll-mt-4 bg-water-50"
        >
          <div className="mx-auto w-full max-w-page px-4 py-14 sm:px-8">
            <h2
              id="how-access-works-heading"
              className="text-2xl font-semibold tracking-tight text-brand-navy"
            >
              How access works
            </h2>
            <ul className="mt-6 grid gap-5 md:grid-cols-3">
              {accessSteps.map(({ icon: Icon, ...item }) => (
                <li
                  key={item.eyebrow}
                  className="flex h-full flex-col rounded-xl border border-t-4 border-water-100 border-t-brand-teal bg-card p-6 shadow-sm sm:p-7"
                >
                  <span className="flex size-11 items-center justify-center rounded-lg bg-water-100 text-brand-deep">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <p className="mt-4 text-xs font-bold tracking-wide text-brand-deep uppercase">
                    {item.eyebrow}
                  </p>
                  <h3 className="mt-1.5 text-xl font-semibold text-brand-navy">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-card-foreground/80">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Dark band like the header (22 Nov styling pass): partner logos, contact and copyright. */}
        <footer className="mt-auto bg-brand-navy text-white">
          <div className="mx-auto grid w-full max-w-page gap-8 px-4 py-10 sm:px-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-start">
            {appConfig.partners.some((p) => p.logo) ? (
              <div className="flex flex-col gap-3">
                <span className="text-xs font-medium tracking-wide text-white/80 uppercase">
                  In partnership with
                </span>
                <PartnerLogos partners={appConfig.partners} size="sm" />
              </div>
            ) : (
              <div />
            )}
            {supportEmail ? (
              <section
                id="contact"
                aria-labelledby="contact-heading"
                className="scroll-mt-4"
              >
                <h2
                  id="contact-heading"
                  className="text-base font-semibold tracking-tight"
                >
                  Contact
                </h2>
                <p className="mt-1 text-sm text-white/80">
                  Questions about access or uploads? Write to the Summit support
                  team.
                </p>
                <a
                  href={`mailto:${supportEmail}`}
                  className="mt-3 inline-flex min-w-0 items-center gap-2 text-sm font-medium break-all text-white underline underline-offset-4 hover:text-brand-aqua"
                >
                  <Mail aria-hidden="true" className="size-4 shrink-0" />
                  {supportEmail}
                </a>
              </section>
            ) : null}
          </div>
          <div className="border-t border-white/15">
            <p className="mx-auto w-full max-w-page px-4 py-5 text-sm text-white/75 sm:px-8">
              {appConfig.copyright}
            </p>
          </div>
        </footer>
      </main>
    </>
  );
}

function WaveLines({ className }: { className?: string }) {
  const rows = [0, 1, 2, 3, 4, 5];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 360 240"
      fill="none"
      className={className}
    >
      {rows.map((row) => {
        const y = 20 + row * 40;
        return (
          <path
            key={row}
            d={`M0 ${y + 20} C 60 ${y - 10}, 120 ${y - 10}, 180 ${y + 20} S 300 ${y + 50}, 360 ${y + 20}`}
            stroke="currentColor"
            strokeWidth="2"
          />
        );
      })}
    </svg>
  );
}

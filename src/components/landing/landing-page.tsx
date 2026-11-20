import { ArrowRight, Mail } from "lucide-react";
import Link from "next/link";
import { PartnerLogos } from "@/components/brand/partner-logos";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { appConfig } from "@/lib/config";

// Public landing page (PLAN v0.3 F1, M6), following docs/mockups/01_landing.png. Name, Summit details, partners
// and the support mailbox all come from config. No project names or country details appear here: the pipeline is
// visible only after sign-in.

const accessSteps = [
  {
    eyebrow: "01 · Invitation only",
    title: "Personal accounts",
    body: "The Summit team creates a personal account for each invited participant and passes on the sign-in details directly.",
  },
  {
    eyebrow: "02 · Governments",
    title: "Countries share their teasers",
    body: "Each participating government uploads its one-page project teasers through its own upload link from the Summit team, and confirms they can be shared. Project information remains the country's.",
  },
  {
    eyebrow: "03 · Investors and operators",
    title: "From teaser to meeting",
    body: "Invited investors and operators view and download the published teasers and request bilateral meetings. The country's focal point accepts or declines each request.",
  },
] as const;

const navLinkClass = "hidden text-white/90 hover:text-white sm:inline";

export function LandingPage() {
  const { summit, supportEmail } = appConfig;
  return (
    <>
      <SiteHeader>
        <a href="#about" className={navLinkClass}>
          About
        </a>
        <a href="#how-access-works" className={navLinkClass}>
          How access works
        </a>
        {supportEmail ? (
          <a href="#contact" className={navLinkClass}>
            Contact
          </a>
        ) : null}
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

      <main className="flex flex-1 flex-col">
        <section
          id="about"
          aria-labelledby="about-heading"
          className="relative overflow-hidden bg-linear-120 from-brand-navy via-brand-deep to-brand-deep text-white lg:to-brand-teal"
        >
          <WaveLines className="pointer-events-none absolute top-1/2 right-[4%] hidden h-64 w-auto -translate-y-1/2 text-white/25 lg:block" />
          <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-8 sm:py-20">
            <p className="rounded-full border border-white/30 bg-white/10 px-3.5 py-1.5 text-xs sm:text-sm">
              {summit.name} · {summit.date} · {summit.conference}, {summit.city}
            </p>
            <h1
              id="about-heading"
              className="max-w-3xl text-3xl leading-tight font-bold tracking-tight sm:text-5xl"
            >
              Investment-ready water projects, shared securely with the people
              who can finance them.
            </h1>
            <p className="max-w-2xl text-base text-white/90 sm:text-lg">
              Participating governments share one-page project teasers with
              invited investors and operators ahead of the {summit.name}, so
              that bilateral meetings start from the same information.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="h-11 bg-white px-5 text-brand-navy hover:bg-white/90"
              >
                <Link href="/sign-in">
                  Sign in
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
          </div>
        </section>

        <section
          id="how-access-works"
          aria-labelledby="how-access-works-heading"
          className="mx-auto w-full max-w-6xl scroll-mt-4 px-4 py-12 sm:px-8"
        >
          <h2
            id="how-access-works-heading"
            className="text-2xl font-semibold tracking-tight"
          >
            How access works
          </h2>
          <ul className="mt-6 grid gap-5 md:grid-cols-3">
            {accessSteps.map((item) => (
              <li
                key={item.eyebrow}
                className="rounded-xl border bg-card p-6 sm:p-7"
              >
                <p className="text-sm font-bold text-brand-deep uppercase">
                  {item.eyebrow}
                </p>
                <h3 className="mt-2 text-xl font-semibold">{item.title}</h3>
                <p className="mt-3 text-card-foreground/80">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {supportEmail ? (
          <section
            id="contact"
            aria-labelledby="contact-heading"
            className="mx-auto w-full max-w-6xl scroll-mt-4 px-4 pb-12 sm:px-8"
          >
            <div className="flex flex-col gap-4 rounded-xl border bg-card p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
              <div>
                <h2
                  id="contact-heading"
                  className="text-xl font-semibold tracking-tight"
                >
                  Contact
                </h2>
                <p className="mt-2 text-card-foreground/80">
                  Questions about access or uploads? Write to the Summit support
                  team.
                </p>
              </div>
              <a
                href={`mailto:${supportEmail}`}
                className="inline-flex min-w-0 items-center gap-2 font-medium break-all text-brand-deep underline underline-offset-4 hover:text-brand-navy focus-visible:rounded focus-visible:ring-3 focus-visible:ring-brand-teal/50 focus-visible:outline-none"
              >
                <Mail aria-hidden="true" className="size-4 shrink-0" />
                {supportEmail}
              </a>
            </div>
          </section>
        ) : null}

        <footer className="mx-auto mt-auto flex w-full max-w-6xl flex-col gap-6 border-t px-4 py-8 text-sm text-foreground/75 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          {appConfig.partners.length > 0 ? (
            <div className="flex flex-wrap items-center gap-4">
              <span>In partnership with</span>
              <PartnerLogos partners={appConfig.partners} />
            </div>
          ) : null}
          <span>{appConfig.developedBy}</span>
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
            strokeWidth="1.5"
          />
        );
      })}
    </svg>
  );
}
